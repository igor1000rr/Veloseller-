/**
 * Идемпотентная активация подписки по оплаченному инвойсу Robokassa.
 *
 * Вызывается из ДВУХ мест (подпись проверяется ВЫШЕ по стеку, сюда — только после неё):
 *  - Result URL  (Password2, server-to-server) — authoritative-подтверждение оплаты;
 *  - Success URL (Password1, возврат из браузера) — резерв на случай, если Result URL
 *    не настроен в кабинете Robokassa или не доходит до сервера. Без резерва деньги
 *    списывались бы, а тариф не выдавался.
 *
 * Активация — это запись АБСОЛЮТНЫХ значений в sellers, поэтому повторный вызов
 * безопасен: Result и Success могут сработать оба; кто первым — тот и активировал,
 * второй увидит status='paid' и сделает no-op.
 *
 * Порядок строгий: сначала активируем подписку (sellers), и ТОЛЬКО при успехе помечаем
 * инвойс paid. Иначе ошибка апдейта sellers проглотилась бы, а быстрый путь
 * status==='paid' навсегда заблокировал бы повторную активацию.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TablesUpdate } from "@/lib/database.types";
import {
  isVeloseLLerPlan,
  isRadarPlan,
  VELOSELLER_WAREHOUSES_LIMITS,
  VELOSELLER_SKU_LIMITS,
  RADAR_BRANDS_LIMITS,
  type VeloseLLerPlan,
  type RadarPlan,
} from "@/lib/robokassa";
import { parseCustomPlanId } from "@/lib/custom-plan";

const SUBSCRIPTION_DAYS = 30;

export type ActivateOutcome =
  | { ok: true; alreadyPaid: boolean }
  | { ok: false; httpStatus: number; reason: string };

export async function activatePaidInvoice(args: {
  invId: string;
  outSum: string;
  isTest: boolean;
  /** Откуда пришла активация — только для логов: "result" | "success". */
  source: "result" | "success";
  signatureValue?: string;
}): Promise<ActivateOutcome> {
  const { invId, outSum, isTest, source } = args;
  const sb = createSupabaseAdminClient();

  const { data: invoice, error: getErr } = await sb
    .from("robokassa_invoices")
    .select("id, seller_id, plan, product_kind, amount, status")
    .eq("inv_id", Number(invId))
    .maybeSingle();

  if (getErr || !invoice) {
    console.warn(`[robokassa-${source}] invoice not found`, { invId, err: getErr?.message });
    return { ok: false, httpStatus: 404, reason: "invoice not found" };
  }

  // Сумму сверяем нормализованно: Robokassa может прислать OutSum как "2500" или
  // "2500.00" — оба валидны (сама сумма закреплена подписью выше). Сравниваем числа.
  const expectedSum = Number(invoice.amount).toFixed(2);
  const paidSum = Number(outSum).toFixed(2);
  if (!Number.isFinite(Number(outSum)) || expectedSum !== paidSum) {
    console.warn(`[robokassa-${source}] amount mismatch`, { invId, expectedSum, outSum });
    return { ok: false, httpStatus: 400, reason: "amount mismatch" };
  }

  // Идемпотентность — если уже paid, просто сообщаем успех (быстрый путь).
  if (invoice.status === "paid") {
    return { ok: true, alreadyPaid: true };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000);

  // Тип активации — по product_kind. Legacy-инвойсы без него имеют DEFAULT 'veloseller'.
  const productKind = invoice.product_kind || "veloseller";
  // «Конструктор» (Александр 04.06.2026): лимиты зашиты в кодировку плана.
  const customParams = parseCustomPlanId(invoice.plan);

  let sellerUpdate: TablesUpdate<"sellers"> | null = null;
  if (productKind === "radar" && isRadarPlan(invoice.plan)) {
    const radarPlanShort = invoice.plan.replace(/^radar_/, "") as "start" | "seller" | "pro" | "expert";
    sellerUpdate = {
      radar_plan: radarPlanShort,
      radar_brands_limit: RADAR_BRANDS_LIMITS[invoice.plan as RadarPlan],
      radar_active_until: expiresAt.toISOString(),
    };
  } else if (customParams) {
    sellerUpdate = {
      plan: invoice.plan,
      plan_warehouses_limit: customParams.warehouses,
      plan_sku_per_warehouse_limit: customParams.skuPerWarehouse,
      subscription_expires_at: expiresAt.toISOString(),
    };
  } else if (isVeloseLLerPlan(invoice.plan)) {
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
      // Транзиентная ошибка БД: НЕ помечаем инвойс paid → пусть Result URL повторит
      // (активация идемпотентна по абсолютным значениям полей).
      console.error(`[robokassa-${source}] seller activation failed, asking retry`, {
        invId, plan: invoice.plan, error: actErr.message,
      });
      return { ok: false, httpStatus: 500, reason: "activation deferred" };
    }
  } else {
    // Неустранимо: plan не сопоставляется с product_kind (баг данных). Повтор не
    // поможет — закрываем инвойс (деньги получены) и логируем critical для сверки.
    console.error(`[robokassa-${source}] cannot activate: plan/product_kind mismatch`, {
      invId, plan: invoice.plan, productKind,
    });
  }

  const { error: updErr } = await sb
    .from("robokassa_invoices")
    .update({
      status: "paid",
      paid_at: now.toISOString(),
      is_test: isTest,
      result_payload: { outSum, invId, isTest, source, signatureValue: args.signatureValue ?? null },
    })
    .eq("id", invoice.id);
  if (updErr) {
    // Активация уже применена (идемпотентна), но статус не зафиксировали — просим
    // повтор; на повторе быстрый путь / повторный апдейт закроют инвойс.
    console.error(`[robokassa-${source}] invoice mark-paid failed`, { invId, error: updErr.message });
    return { ok: false, httpStatus: 500, reason: "db update failed" };
  }

  console.log(`[robokassa-${source}] paid + activated`, { invId, plan: invoice.plan, productKind, isTest });
  return { ok: true, alreadyPaid: false };
}
