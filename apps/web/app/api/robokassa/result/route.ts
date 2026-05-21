import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyResultSignature } from "@/lib/robokassa";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Result URL для Robokassa — webhook о успешной оплате.
 *
 * Робокасса вызывает этот endpoint ПОСЛЕ успешной оплаты в фоне (параллельно
 * редиректу юзера на SuccessURL). Надо:
 *  1. Проверить подпись через Password2
 *  2. Обновить invoice → paid
 *  3. Обновить seller.plan + subscription_expires_at = now() + 30 дней
 *  4. Ответить ровно "OK{InvId}" plain text — без этого Robokassa будет ретраить.
 *
 * Дока: https://docs.robokassa.ru/pay-interface/#resulturl
 *
 * Поддерживает и POST (form-data) и GET (query string).
 *
 * Аудит-фиксы:
 *  - rate-limit 60/min по IP (защита от flood; подпись валидируется, но эндпоинт
 *    публичный и не должен ложить worker сотнями левых запросов).
 *  - IsTest=1 в проде → FAIL: если ROBOKASSA_TEST_MODE!=1, отказываемся активировать
 *    подписку по тестовой подписи. Защита от утечки TestPassword в продакшен.
 *  - invoice старше 7 дней → FAIL: защита от активации подписки задним числом
 *    (создан invoice месяц назад, оплачен сейчас → подписка получала бы +30д от now).
 */

const INVOICE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 дней
const WEBHOOK_RATE_LIMIT = { max: 60, windowMs: 60_000 };

async function handle(req: NextRequest): Promise<Response> {
  // Rate-limit по IP — webhook публичный, подпись валидируется ниже, но flood
  // дешевле выкинуть на 429 чем гонять MD5 на каждом запросе.
  const ip = getClientIp(req);
  const rl = checkRateLimit(`robokassa-result:${ip}`, WEBHOOK_RATE_LIMIT);
  if (!rl.allowed) {
    return new Response("FAIL: rate limit", { status: 429 });
  }

  let outSum: string | null = null;
  let invId: string | null = null;
  let signatureValue: string | null = null;
  let isTest = false;

  if (req.method === "POST") {
    const form = await req.formData().catch(() => null);
    if (form) {
      outSum = form.get("OutSum")?.toString() || null;
      invId = form.get("InvId")?.toString() || null;
      signatureValue = form.get("SignatureValue")?.toString() || null;
      isTest = form.get("IsTest")?.toString() === "1";
    }
  } else {
    const { searchParams } = new URL(req.url);
    outSum = searchParams.get("OutSum");
    invId = searchParams.get("InvId");
    signatureValue = searchParams.get("SignatureValue");
    isTest = searchParams.get("IsTest") === "1";
  }

  if (!outSum || !invId || !signatureValue) {
    return new Response("FAIL: missing params", { status: 400 });
  }

  // Проверяем подпись (защита от поддельных вызовов endpoint'а)
  if (!verifyResultSignature({ outSum, invId, signatureValue })) {
    return new Response("FAIL: bad signature", { status: 400 });
  }

  // IsTest защита: если сервер в проде — не активируем подписку по тест-подписи.
  // Иначе утечка TestPassword2 = бесплатное активирование любого тарифа.
  const serverTestMode = process.env.ROBOKASSA_TEST_MODE === "1";
  if (isTest && !serverTestMode) {
    console.warn("[robokassa-result] IsTest=1 в проде — отказ", { invId, ip });
    return new Response("FAIL: bad mode", { status: 400 });
  }

  // Находим invoice (используем admin client — юзера в этом запросе нет из-за server-to-server)
  const sb = createSupabaseAdminClient();
  const { data: invoice, error: getErr } = await sb
    .from("robokassa_invoices")
    .select("id, seller_id, plan, amount, status, created_at")
    .eq("inv_id", Number(invId))
    .maybeSingle();

  if (getErr || !invoice) {
    return new Response("FAIL: invoice not found", { status: 404 });
  }

  // Сумма должна совпадать (защита от подмены суммы)
  const expectedSum = Number(invoice.amount).toFixed(2);
  if (expectedSum !== outSum) {
    return new Response("FAIL: amount mismatch", { status: 400 });
  }

  // Защита от активации задним числом — invoice старше 7 дней не активируем
  const createdAt = invoice.created_at ? new Date(invoice.created_at).getTime() : 0;
  if (createdAt > 0 && Date.now() - createdAt > INVOICE_MAX_AGE_MS) {
    console.warn("[robokassa-result] invoice expired", { invId, createdAt });
    return new Response("FAIL: invoice expired", { status: 400 });
  }

  // Идемпотентность — если уже paid, просто отвечаем OK (Robokassa может вызвать дважды)
  if (invoice.status === "paid") {
    return new Response(`OK${invId}`, { headers: { "Content-Type": "text/plain" } });
  }

  // Обновляем invoice
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней

  const { error: updErr } = await sb
    .from("robokassa_invoices")
    .update({
      status: "paid",
      paid_at: now.toISOString(),
      is_test: isTest,
      result_payload: { outSum, invId, signatureValue, isTest },
    })
    .eq("id", invoice.id);
  if (updErr) {
    return new Response("FAIL: db update failed", { status: 500 });
  }

  // Активируем подписку (и в test mode — чтобы можно было проверить flow)
  const planLimits: Record<string, number> = {
    starter: 2, growth: 6, pro: 15,
  };
  const limit = planLimits[invoice.plan] ?? 15;

  await sb
    .from("sellers")
    .update({
      plan: invoice.plan,
      plan_warehouses_limit: limit,
      subscription_expires_at: expiresAt.toISOString(),
    })
    .eq("id", invoice.seller_id);

  // Robokassa ждёт именно "OK{InvId}" в ответ — иначе будет ретраить
  return new Response(`OK${invId}`, {
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
