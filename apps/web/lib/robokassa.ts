/**
 * Robokassa helpers — генерация URL оплаты и проверка подписей.
 *
 * Поддерживает две оси биллинга:
 *  - Veloseller: starter (2500₽) / growth (6900₽) / pro (14900₽, legacy)
 *                + «Конструктор» custom_{wh}x{sku} (см. lib/custom-plan.ts)
 *  - Radar:      radar_start (900₽) / radar_seller (2500₽) / radar_pro (5000₽) / radar_expert (10000₽)
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
import { createHash, timingSafeEqual } from "node:crypto";
import { parseCustomPlanId, customPlanPrice, customPlanLabel } from "./custom-plan";

export type VeloseLLerPlan = "starter" | "growth" | "pro";
export type RadarPlan = "radar_start" | "radar_seller" | "radar_pro" | "radar_expert";
export type Plan = VeloseLLerPlan | RadarPlan;
export type ProductKind = "veloseller" | "radar";

/**
 * Цены в рублях.
 * Veloseller: тарифы Александра — multi-warehouse SaaS.
 *   pro — legacy: из сетки 04.06.2026 убран (заменён Конструктором), но остаётся
 *   валидным для активации старых инвойсов и продления существующих подписок.
 * Radar: тарифы из ТЗ — отслеживание новинок брендов.
 */
export const PLAN_PRICES: Record<Plan, number> = {
  // Veloseller
  starter: 2500,
  growth:  6900,
  pro:     14900,
  // Radar (исправлены лимиты Trial: 3 бренда, а не 30 — иначе никто Start не купит)
  radar_start:  900,    // 3 бренда
  radar_seller: 2500,   // 10 брендов
  radar_pro:    5000,   // 30 брендов
  radar_expert: 10000,  // 100 брендов
};

/**
 * Лимит брендов на тариф Radar — используется при активации подписки в webhook.
 */
export const RADAR_BRANDS_LIMITS: Record<RadarPlan, number> = {
  radar_start:  3,
  radar_seller: 10,
  radar_pro:    30,
  radar_expert: 100,
};

/**
 * Лимит складов на тариф Veloseller — используется при активации в webhook.
 * Сетка Александра 04.06.2026: Рост = 5 складов (было 6).
 */
export const VELOSELLER_WAREHOUSES_LIMITS: Record<VeloseLLerPlan, number> = {
  starter: 2,
  growth:  5,
  pro:     15,
};

/**
 * Лимит SKU на один склад (сетка Александра 04.06.2026).
 * Пишется в sellers.plan_sku_per_warehouse_limit при активации.
 * pro (legacy) получает триальный потолок 10000.
 */
export const VELOSELLER_SKU_LIMITS: Record<VeloseLLerPlan, number> = {
  starter: 1000,
  growth:  2000,
  pro:     10000,
};

/**
 * Человекочитаемые названия для UI и description в Robokassa.
 */
export const PLAN_LABELS: Record<Plan, string> = {
  starter:      "Старт",
  growth:       "Рост",
  pro:          "Про",
  radar_start:  "Radar Старт",
  radar_seller: "Radar Селлер",
  radar_pro:    "Radar Про",
  radar_expert: "Radar Эксперт",
};

export function isValidPlan(plan: string): plan is Plan {
  return plan in PLAN_PRICES;
}

/** Любой оплачиваемый план: фиксированный тариф ИЛИ валидный конструктор. */
export function isPayablePlan(plan: string): boolean {
  return isValidPlan(plan) || parseCustomPlanId(plan) !== null;
}

/** Цена плана (фикс или конструктор). null — план не оплачивается. */
export function planPriceOf(plan: string): number | null {
  if (isValidPlan(plan)) return PLAN_PRICES[plan];
  const custom = parseCustomPlanId(plan);
  return custom ? customPlanPrice(custom) : null;
}

/** Название плана для description Робокассы (фикс или конструктор). */
export function planLabelOf(plan: string): string {
  if (isValidPlan(plan)) return PLAN_LABELS[plan];
  const custom = parseCustomPlanId(plan);
  return custom ? customPlanLabel(custom) : plan;
}

export function isVeloseLLerPlan(plan: Plan): plan is VeloseLLerPlan {
  return plan === "starter" || plan === "growth" || plan === "pro";
}

export function isRadarPlan(plan: Plan): plan is RadarPlan {
  return plan.startsWith("radar_");
}

export function productKindOf(plan: Plan): ProductKind {
  return isRadarPlan(plan) ? "radar" : "veloseller";
}

/** ProductKind для любой строки плана: radar_* → radar, иначе veloseller (включая custom). */
export function productKindOfPlan(plan: string): ProductKind {
  return plan.startsWith("radar_") ? "radar" : "veloseller";
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

function md5Hex(input: string): string {
  return createHash("md5").update(input, "utf8").digest("hex");
}

/**
 * Constant-time сравнение двух hex-строк подписи.
 * Сначала сверяем длину (она не секретна — формат подписи публичный),
 * затем timingSafeEqual по равным буферам, чтобы не утекало время сравнения.
 */
function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a.toLowerCase(), "utf8");
  const bb = Buffer.from(b.toLowerCase(), "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Генерирует URL на Robokassa для оплаты.
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

  const outSum = args.amount.toFixed(2);
  const invId = String(args.invId);
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
 * Проверяет подпись Result URL от Robokassa (constant-time).
 */
export function verifyResultSignature(args: {
  outSum: string;
  invId: string;
  signatureValue: string;
}): boolean {
  const password2 = getPassword2();
  if (!password2) return false;
  const expected = md5Hex(`${args.outSum}:${args.invId}:${password2}`);
  return safeEqualHex(expected, args.signatureValue);
}
