import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TablesUpdate } from "@/lib/database.types";
import {
  verifyResultSignature,
  isVeloseLLerPlan,
  isRadarPlan,
  VELOSELLER_WAREHOUSES_LIMITS,
  VELOSELLER_SKU_LIMITS,
  RADAR_BRANDS_LIMITS,
  type VeloseLLerPlan,
  type RadarPlan,
} from "@/lib/robokassa";
import { parseCustomPlanId } from "@/lib/custom-plan";
import { enforceRateLimitDurable, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Result URL для Robokassa — webhook о успешной оплате.
 *
 * После успешной оплаты Robokassa вызывает этот endpoint:
 *  1. Проверяем подпись через Password2
 *  2. Проверяем совпадение test/prod-режима сервера с IsTest флагом
 *  3. Проверяем сумму против сохранённого инвойса
 *  4. АКТИВИРУЕМ подписку — в зависимости от product_kind:
 *     - veloseller: seller.plan + plan_warehouses_limit + plan_sku_per_warehouse_limit
 *                   + subscription_expires_at. Лимиты: фикс-тариф — из таблиц
 *                   robokassa.ts; «Конструктор» custom_{wh}x{sku} — из кодировки плана.
 *     - radar:      seller.radar_plan + radar_brands_limit + radar_active_until
 *  5. И ТОЛЬКО при успешной активации помечаем инвойс paid.
 *  6. Отвечаем ровно "OK{InvId}" plain text — без этого Robokassa будет ретраить.
 *
 * ВАЖНО (порядок): активация идёт ДО пометки paid. Раньше было наоборот, и ошибка
 * апдейта sellers молча проглатывалась → клиент оплатил, инвойс=paid, тариф не выдан,
 * а быстрый путь status==='paid' навсегда блокировал повторную активацию.
 */

async function handle(req: NextRequest): Promise<Response> {
  const limited = await enforceRateLimitDurable(req, RATE_LIMITS.WEBHOOK);
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

  const serverIsTest = process.env.ROBOKASSA_TEST_MODE === "1";
  if (isTest !== serverIsTest) {
    console.warn("[robokassa-result] test/prod mode mismatch", {
      serverIsTest, callbackIsTest: isTest, invId,
    });
    return new Response("FAIL: test/prod mode mismatch", { status: 400 });
  }

  if (!verifyResultSignature({ outSum, invId, signatureValue })) {
    return new Response("FAIL: bad signature", { status: 400 });
  }

  const sb = createSupabaseAdminClient();
  const { data: invoice, error: getErr } = await sb
    .from("robokassa_invoices")
    .select("id, seller_id, plan, product_kind, amount, status, created_at")
    .eq("inv_id", Number(invId))
    .maybeSingle();

  if (getErr || !invoice) {
    return new Response("FAIL: invoice not found", { status: 404 });
  }

  const expectedSum = Number(invoice.amount).toFixed(2);
  if (expectedSum !== outSum) {
    return new Response("FAIL: amount mismatch", { status: 400 });
  }

  // Идемпотентность — если уже paid, просто отвечаем OK (быстрый путь).
  if (invoice.status === "paid") {
    return new Response(`OK${invId}`, { headers: { "Content-Type": "text/plain" } });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней

  // 1) Сначала АКТИВИРУЕМ подписку. Тип активации — по product_kind.
  // Legacy invoices без product_kind (до миграции) имеют DEFAULT 'veloseller'.
  const productKind = invoice.product_kind || "veloseller";
  // «Конструктор» (Александр 04.06.2026): лимиты зашиты в кодировку плана.
  const customParams = parseCustomPlanId(invoice.plan);

  let sellerUpdate: TablesUpdate<"sellers"> | null = null;
  if (productKind === "radar" && isRadarPlan(invoice.plan)) {
    // Radar подписка — radar_* поля sellers. Префикс 'radar_' в биллинге,
    // в sellers.radar_plan — без префикса.
    const radarPlanShort = invoice.plan.replace(/^radar_/, "") as "start" | "seller" | "pro" | "expert";
    sellerUpdate = {
      radar_plan: radarPlanShort,
      radar_brands_limit: RADAR_BRANDS_LIMITS[invoice.plan as RadarPlan],
      radar_active_until: expiresAt.toISOString(),
    };
  } else if (customParams) {
    // Конструктор: складов и SKU/склад ровно сколько оплачено.
    sellerUpdate = {
      plan: invoice.plan,
      plan_warehouses_limit: customParams.warehouses,
      plan_sku_per_warehouse_limit: customParams.skuPerWarehouse,
      subscription_expires_at: expiresAt.toISOString(),
    };
  } else if (isVeloseLLerPlan(invoice.plan)) {
    // Veloseller фикс-тариф — plan + лимиты складов/SKU + expires.
    sellerUpdate = {
      plan: invoice.plan,
      plan_warehouses_limit: VELOSELLER_WAREHOUSES_LIMITS[invoice.plan as VeloseLLerPlan],
      plan_sku_per_warehouse_limit: VELOSELLER_SKU_LIMITS[invoice.plan as VeloseLLerPlan],
      subscription_expires_at: expiresAt.toISOString(),
    };
  }

  if (sellerUpdate) {
    const { error: actErr } = await sb
      .from("sellers")
      .update(sellerUpdate)
      .eq("id", invoice.seller_id);
    if (actErr) {
      // Транзиентная ошибка БД: НЕ помечаем инвойс paid → Robokassa повторит,
      // активация идемпотентна (абсолютные значения полей).
      console.error("[robokassa-result] seller activation failed, asking retry", {
        invId, plan: invoice.plan, error: actErr.message,
      });
      return new Response("FAIL: activation deferred", { status: 500 });
    }
  } else {
    // Неустранимо: plan не сопоставляется с product_kind (баг данных). Повтор не
    // поможет — закрываем инвойс (деньги получены) и логируем critical для сверки.
    console.error("[robokassa-result] cannot activate: plan/product_kind mismatch", {
      invId, plan: invoice.plan, productKind,
    });
  }

  // 2) Активация успешна (или нечего применять) → фиксируем инвойс paid.
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
    // Активация уже применена (идемпотентна), но статус не зафиксировали — просим
    // Robokassa повторить; на повторе быстрый путь / повторный апдейт закроют инвойс.
    console.error("[robokassa-result] invoice mark-paid failed", { invId, error: updErr.message });
    return new Response("FAIL: db update failed", { status: 500 });
  }

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
