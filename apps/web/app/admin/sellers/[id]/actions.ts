"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  VELOSELLER_WAREHOUSES_LIMITS,
  VELOSELLER_SKU_LIMITS,
  RADAR_BRANDS_LIMITS,
  type VeloseLLerPlan,
  type RadarPlan,
} from "@/lib/robokassa";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export type ActionResult = { ok: boolean; message: string; link?: string };

const DAY_MS = 86400_000;

/** Проверка прав + email текущего админа (для журнала). */
async function requireAdmin(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const email = (user.email || "").toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) throw new Error("forbidden");
  return email;
}

/** Запись в журнал. Ошибку журналирования глотаем — она не должна валить само действие. */
async function logAction(adminEmail: string, action: string, sellerId: string, details: Record<string, unknown>) {
  try {
    const admin = createSupabaseAdminClient();
    await admin.from("admin_audit_log").insert({
      admin_email: adminEmail,
      action,
      target_seller_id: sellerId,
      details,
    });
  } catch { /* журнал не критичен */ }
}

function asInt(v: FormDataEntryValue | null, fallback = 0): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Тариф Veloseller + лимиты + срок подписки.
 * Платный план с months > 0 → активирует/продлевает подписку (от max(now, текущая дата)).
 * Trial → откат в триал (subscription_expires_at = null, лимиты 15×10000).
 */
export async function adminSaveBilling(formData: FormData): Promise<ActionResult> {
  const adminEmail = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  const plan = String(formData.get("plan") || "");
  if (!sellerId) return { ok: false, message: "sellerId required" };

  const admin = createSupabaseAdminClient();
  const now = new Date();

  if (plan === "trial") {
    const { error } = await admin.from("sellers").update({
      plan: "trial",
      subscription_expires_at: null,
      plan_warehouses_limit: 15,
      plan_sku_per_warehouse_limit: 10000,
      subscription_status: null,
      updated_at: now.toISOString(),
    }).eq("id", sellerId);
    if (error) return { ok: false, message: error.message };
    await logAction(adminEmail, "billing.downgrade_trial", sellerId, { plan });
    revalidatePath(`/admin/sellers/${sellerId}`);
    return { ok: true, message: "Откат в триал выполнен" };
  }

  if (!(plan in VELOSELLER_WAREHOUSES_LIMITS)) {
    return { ok: false, message: `Неизвестный план: ${plan}` };
  }
  const p = plan as VeloseLLerPlan;

  const months = asInt(formData.get("months"), 0);
  const whRaw = String(formData.get("warehouses") ?? "");
  const skuRaw = String(formData.get("sku") ?? "");
  const warehouses = whRaw === "" ? VELOSELLER_WAREHOUSES_LIMITS[p] : asInt(whRaw, VELOSELLER_WAREHOUSES_LIMITS[p]);
  const sku = skuRaw === "" ? VELOSELLER_SKU_LIMITS[p] : asInt(skuRaw, VELOSELLER_SKU_LIMITS[p]);

  const patch: Record<string, unknown> = {
    plan: p,
    plan_warehouses_limit: warehouses,
    plan_sku_per_warehouse_limit: sku,
    last_payment_failed_at: null,
    last_payment_failed_reason: null,
    payment_failure_count: 0,
    subscription_status: "active",
    updated_at: now.toISOString(),
  };

  if (months > 0) {
    const { data: cur } = await admin.from("sellers")
      .select("subscription_expires_at").eq("id", sellerId).maybeSingle();
    const base = cur?.subscription_expires_at && new Date(cur.subscription_expires_at).getTime() > now.getTime()
      ? new Date(cur.subscription_expires_at)
      : now;
    patch.subscription_expires_at = new Date(base.getTime() + months * 30 * DAY_MS).toISOString();
    patch.last_payment_succeeded_at = now.toISOString();
  }

  const { error } = await admin.from("sellers").update(patch).eq("id", sellerId);
  if (error) return { ok: false, message: error.message };
  await logAction(adminEmail, "billing.set_plan", sellerId, { plan: p, warehouses, sku, months });
  revalidatePath(`/admin/sellers/${sellerId}`);
  return {
    ok: true,
    message: months > 0
      ? `План ${p}, лимиты ${warehouses}×${sku}, подписка +${months} мес`
      : `План ${p}, лимиты ${warehouses}×${sku} (срок подписки не изменён)`,
  };
}

/** Триал: дата окончания = сегодня + N дней. */
export async function adminSaveTrial(formData: FormData): Promise<ActionResult> {
  const adminEmail = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  const days = asInt(formData.get("days"), 0);
  if (!sellerId) return { ok: false, message: "sellerId required" };
  if (days <= 0) return { ok: false, message: "Дней должно быть > 0" };

  const admin = createSupabaseAdminClient();
  const ends = new Date(Date.now() + days * DAY_MS).toISOString();
  const { error } = await admin.from("sellers")
    .update({ trial_ends_at: ends, updated_at: new Date().toISOString() })
    .eq("id", sellerId);
  if (error) return { ok: false, message: error.message };
  await logAction(adminEmail, "trial.set", sellerId, { days, ends });
  revalidatePath(`/admin/sellers/${sellerId}`);
  return { ok: true, message: `Триал до ${new Date(ends).toLocaleDateString("ru-RU")}` };
}

/** Radar: план + срок + лимит брендов. */
const RADAR_PLAN_VALUES = ["none", "trial", "start", "seller", "pro", "expert"] as const;
function radarBrandsDefault(plan: string): number {
  if (plan === "trial") return 3;
  const key = `radar_${plan}` as RadarPlan;
  return (RADAR_BRANDS_LIMITS as Record<string, number>)[key] ?? 0;
}

export async function adminSaveRadar(formData: FormData): Promise<ActionResult> {
  const adminEmail = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  const plan = String(formData.get("radarPlan") || "");
  if (!sellerId) return { ok: false, message: "sellerId required" };
  if (!(RADAR_PLAN_VALUES as readonly string[]).includes(plan)) {
    return { ok: false, message: `Неизвестный Radar-план: ${plan}` };
  }
  const admin = createSupabaseAdminClient();
  const now = new Date();

  if (plan === "none") {
    const { error } = await admin.from("sellers").update({
      radar_plan: "none", radar_brands_limit: 0, radar_active_until: null,
      updated_at: now.toISOString(),
    }).eq("id", sellerId);
    if (error) return { ok: false, message: error.message };
    await logAction(adminEmail, "radar.disable", sellerId, {});
    revalidatePath(`/admin/sellers/${sellerId}`);
    return { ok: true, message: "Radar выключен" };
  }

  const days = asInt(formData.get("radarDays"), plan === "trial" ? 14 : 30);
  const brandsRaw = String(formData.get("radarBrands") ?? "");
  const brands = brandsRaw === "" ? radarBrandsDefault(plan) : asInt(brandsRaw, radarBrandsDefault(plan));
  const until = new Date(now.getTime() + days * DAY_MS).toISOString();

  const patch: Record<string, unknown> = {
    radar_plan: plan,
    radar_brands_limit: brands,
    radar_active_until: until,
    updated_at: now.toISOString(),
  };
  if (plan === "trial") patch.radar_trial_started_at = now.toISOString();

  const { error } = await admin.from("sellers").update(patch).eq("id", sellerId);
  if (error) return { ok: false, message: error.message };
  await logAction(adminEmail, "radar.set", sellerId, { plan, days, brands });
  revalidatePath(`/admin/sellers/${sellerId}`);
  return { ok: true, message: `Radar ${plan}: ${brands} брендов до ${new Date(until).toLocaleDateString("ru-RU")}` };
}

/** Одноразовая ссылка сброса пароля (Supabase recovery). Письмо не шлём — админ передаёт ссылку сам. */
export async function adminPasswordReset(formData: FormData): Promise<ActionResult> {
  const adminEmail = await requireAdmin();
  const sellerId = String(formData.get("sellerId") || "");
  if (!sellerId) return { ok: false, message: "sellerId required" };
  const admin = createSupabaseAdminClient();
  const { data: seller } = await admin.from("sellers").select("email").eq("id", sellerId).maybeSingle();
  if (!seller?.email) return { ok: false, message: "email селлера не найден" };
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email: seller.email });
    if (error) return { ok: false, message: error.message };
    const link = (data as any)?.properties?.action_link as string | undefined;
    if (!link) return { ok: false, message: "ссылка не сгенерирована" };
    await logAction(adminEmail, "account.password_reset_link", sellerId, { email: seller.email });
    return { ok: true, message: "Ссылка сброса пароля сгенерирована", link };
  } catch (e: any) {
    return { ok: false, message: e?.message || "ошибка генерации ссылки" };
  }
}
