/**
 * Robokassa helpers — генерация URL оплаты и проверка подписей.
 *
 * Дока: https://docs.robokassa.ru/pay-interface/
 *
 * Подписи (MD5 hex лоуэркейс):
 *  - При создании URL: md5(`${MerchantLogin}:${OutSum}:${InvId}:${Password1}`)
 *  - При проверке Result URL:  md5(`${OutSum}:${InvId}:${Password2}`)
 *
 * Test mode: если ROBOKASSA_TEST_MODE=1 — используются TestPassword1/TestPassword2,
 * URL на боевой сервер Robokassa с флагом IsTest=1.
 *
 * ENV variables:
 *  - ROBOKASSA_MERCHANT_LOGIN
 *  - ROBOKASSA_PASSWORD_1 (для боевого)
 *  - ROBOKASSA_PASSWORD_2 (для боевого)
 *  - ROBOKASSA_TEST_MODE — "1" включает test mode
 *  - ROBOKASSA_TEST_PASSWORD_1 (для теста)
 *  - ROBOKASSA_TEST_PASSWORD_2 (для теста)
 */
import { createHash } from "node:crypto";

export type Plan = "starter" | "growth" | "pro";

/**
 * Цены в рублях (месячная стоимость по решению Александра).
 * Совпадают с plan_warehouses_limit в sellers.
 */
export const PLAN_PRICES: Record<Plan, number> = {
  starter: 2500,
  growth:  6900,
  pro:     14900,
};

export function isValidPlan(plan: string): plan is Plan {
  return plan === "starter" || plan === "growth" || plan === "pro";
}

function isTestMode(): boolean {
  return process.env.ROBOKASSA_TEST_MODE === "1";
}

function getMerchantLogin(): string | null {
  return process.env.ROBOKASSA_MERCHANT_LOGIN || null;
}

function getPassword1(): string | null {
  return isTestMode()
    ? (process.env.ROBOKASSA_TEST_PASSWORD_1 || null)
    : (process.env.ROBOKASSA_PASSWORD_1 || null);
}

function getPassword2(): string | null {
  return isTestMode()
    ? (process.env.ROBOKASSA_TEST_PASSWORD_2 || null)
    : (process.env.ROBOKASSA_PASSWORD_2 || null);
}

/**
 * Проверяет что все ENV заданы. Если нет — возвращает описание ошибки.
 */
export function checkRobokassaConfig(): { ok: true } | { ok: false; error: string } {
  if (!getMerchantLogin()) {
    return { ok: false, error: "ROBOKASSA_MERCHANT_LOGIN не задан" };
  }
  if (!getPassword1()) {
    return { ok: false, error: `ROBOKASSA_${isTestMode() ? "TEST_" : ""}PASSWORD_1 не задан` };
  }
  if (!getPassword2()) {
    return { ok: false, error: `ROBOKASSA_${isTestMode() ? "TEST_" : ""}PASSWORD_2 не задан` };
  }
  return { ok: true };
}

/**
 * MD5 hex в lowercase — формат в котором Робокасса ожидает SignatureValue.
 */
function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * Генерирует URL на Robokassa для оплаты.
 *
 * Пример URL: https://auth.robokassa.ru/Merchant/Index.aspx?MerchantLogin=...&OutSum=2500.00&InvId=1&Description=...&SignatureValue=...
 */
export function buildPaymentUrl(args: {
  invId: number;
  amount: number;
  description: string;
  email?: string | null;
}): string {
  const merchantLogin = getMerchantLogin();
  const password1 = getPassword1();
  if (!merchantLogin || !password1) {
    throw new Error("Robokassa not configured");
  }

  // Сумма всегда с 2 знаками после запятой (иначе подпись не совпадёт)
  const outSum = args.amount.toFixed(2);
  const invId = String(args.invId);

  // Подпись формируется из 4 полей, разделённых двоеточием
  const signature = md5Hex(`${merchantLogin}:${outSum}:${invId}:${password1}`);

  const params = new URLSearchParams({
    MerchantLogin: merchantLogin,
    OutSum: outSum,
    InvId: invId,
    Description: args.description,
    SignatureValue: signature,
    Culture: "ru",
    Encoding: "utf-8",
  });

  if (args.email) {
    params.set("Email", args.email);
  }
  if (isTestMode()) {
    params.set("IsTest", "1");
  }

  return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
}

/**
 * Проверяет подпись Result URL от Robokassa.
 *
 * Подпись в Result URL формируется из 3 полей — без MerchantLogin,
 * и с использованием Password2.
 *
 * Сравнение case-insensitive (Робокасса может прислать uppercase).
 */
export function verifyResultSignature(args: {
  outSum: string;
  invId: string;
  signatureValue: string;
}): boolean {
  const password2 = getPassword2();
  if (!password2) return false;
  const expected = md5Hex(`${args.outSum}:${args.invId}:${password2}`);
  return expected.toLowerCase() === args.signatureValue.toLowerCase();
}
