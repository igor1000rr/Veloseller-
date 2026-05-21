import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyResultSignature } from "@/lib/robokassa";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Result URL для Robokassa — webhook о успешной оплате.
 *
 * Робокасса вызывает этот endpoint ПОСЛЕ успешной оплаты в фоне (параллельно
 * редиректу юзера на SuccessURL). Надо:
 *  1. Проверить подпись через Password2
 *  2. Проверить совпадение test/prod-режима сервера с IsTest флагом
 *  3. Обновить invoice → paid
 *  4. Обновить seller.plan + subscription_expires_at = now() + 30 дней
 *  5. Ответить ровно "OK{InvId}" plain text — без этого Robokassa будет ретраить.
 *
 * Дока: https://docs.robokassa.ru/pay-interface/#resulturl
 *
 * Поддерживает и POST (form-data) и GET (query string).
 *
 * SECURITY FIX (test/prod mismatch): раньше IsTest=1 принимался и на prod-сервере —
 * то есть кто угодно с test_password мог активировать платную подписку. Теперь
 * сервер отклоняет callback если режим IsTest не совпадает с ROBOKASSA_TEST_MODE.
 *
 * SECURITY FIX (signature flood DDoS): добавлен IP-based rate-limit. Без password
 * подписать запрос нельзя, но cheap-флуд проверок подписи теперь ограничен.
 */

async function handle(req: NextRequest): Promise<Response> {
  // Rate-limit IP-based (WEBHOOK = 60/min) — защита от signature-флуда
  const limited = enforceRateLimit(req, RATE_LIMITS.WEBHOOK);
  if (limited) return new Response("FAIL: rate limit", { status: 429 });

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

  // Проверка совпадения режима: prod-сервер не принимает test-callback и наоборот.
  // Защищает от ситуации, когда злоумышленник с test_password атакует prod-сервер.
  const serverIsTest = process.env.ROBOKASSA_TEST_MODE === "1";
  if (isTest !== serverIsTest) {
    console.warn("[robokassa-result] test/prod mode mismatch", {
      serverIsTest, callbackIsTest: isTest, invId,
    });
    return new Response("FAIL: test/prod mode mismatch", { status: 400 });
  }

  // Проверяем подпись (защита от поддельных вызовов endpoint'а)
  if (!verifyResultSignature({ outSum, invId, signatureValue })) {
    return new Response("FAIL: bad signature", { status: 400 });
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
