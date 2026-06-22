"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth";
import { getWorkerConfig, callWorker, workerErrorText, fireAndForgetRecalc } from "@/lib/api";
import {
  RADAR_BRANDS_LIMITS,
  type RadarPlan,
} from "@/lib/robokassa";
import type { Json, TablesUpdate } from "@/lib/database.types";

export type ActionResult = { ok: true; link?: string } | { ok: false; error: string };

/** Server-action гард: бросает при отсутствии прав, возвращает e-mail админа для аудита. */
async function requireAdmin(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");
  const email = (user.email || "").toLowerCase();
  if (!isAdminEmail(email)) throw new Error("forbidden");
  return email;
}

async function logAdminAction(
  adminEmail: string,
  action: string,
  targetSellerId: string | null,
  details: Json,
) {
  const admin = createSupabaseAdminClient();
  await admin.from("admin_audit_log").insert({
    admin_email: adminEmail,
    action,
    target_seller_id: targetSellerId,
    details,
  });
}

const VELO_PLANS = ["trial", "starter", "growth", "pro"] as const;
const RADAR_STORED = ["none", "start", "seller", "pro", "expert"] as const;

/** План + лимиты (+ опционально продлить подписку на N дней). */
export async function adminSaveBilling(formData: FormData): Promise<ActionResult> {
  try {
    const adminEmail = await requireAdmin();
    const sellerId = String(formData.get("sellerId") || "");
    const plan = String(formData.get("plan") || "");
    const warehousesLimit = parseInt(String(formData.get("warehousesLimit") || ""), 10);
    const skuLimit = parseInt(String(formData.get("skuLimit") || ""), 10);
    const extendDays = parseInt(String(formData.get("extendDays") || "0"), 10) || 0;

    if (!sellerId) return { ok: false, error: "sellerId required" };
    if (!(VELO_PLANS as readonly string[]).includes(plan)) return { ok: false, error: "invalid plan" };
    if (!Number.isFinite(warehousesLimit) || warehousesLimit < 0) return { ok: false, error: "invalid warehouses limit" };
    if (!Number.isFinite(skuLimit) || skuLimit < 0) return { ok: false, error: "invalid sku limit" };

    const admin = createSupabaseAdminClient();
    const { data: current } = await admin.from("sellers")
      .select("subscription_expires_at").eq("id", sellerId).maybeSingle();

    const patch: TablesUpdate<"sellers"> = {
      plan,
      plan_warehouses_limit: warehousesLimit,
      plan_sku_per_warehouse_limit: skuLimit,
      updated_at: new Date().toISOString(),
    };
    if (extendDays > 0) {
      const existing = current?.subscription_expires_at ? new Date(current.subscription_expires_at) : null;
      const base = existing && existing.getTime() > Date.now() ? existing : new Date();
      patch.subscription_expires_at = new Date(base.getTime() + extendDays * 86400_000).toISOString();
      patch.subscription_status = "active";
      patch.last_payment_failed_at = null;
      patch.last_payment_failed_reason = null;
      patch.payment_failure_count = 0;
    }

    const { error } = await admin.from("sellers").update(patch).eq("id", sellerId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminEmail, "billing.save", sellerId, { plan, warehousesLimit, skuLimit, extendDays });
    revalidatePath(`/admin/sellers/${sellerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

/** Триал: trial_ends_at = сегодня + N дней. */
export async function adminSaveTrial(formData: FormData): Promise<ActionResult> {
  try {
    const adminEmail = await requireAdmin();
    const sellerId = String(formData.get("sellerId") || "");
    const trialDays = parseInt(String(formData.get("trialDays") || ""), 10);
    if (!sellerId) return { ok: false, error: "sellerId required" };
    if (!Number.isFinite(trialDays) || trialDays < 0 || trialDays > 365) return { ok: false, error: "invalid days" };

    const until = new Date(Date.now() + trialDays * 86400_000).toISOString();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("sellers")
      .update({ trial_ends_at: until, updated_at: new Date().toISOString() })
      .eq("id", sellerId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminEmail, "trial.set", sellerId, { trialDays, until });
    revalidatePath(`/admin/sellers/${sellerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

/** Radar: тариф + лимит брендов из сетки + продление radar_active_until. */
export async function adminSaveRadar(formData: FormData): Promise<ActionResult> {
  try {
    const adminEmail = await requireAdmin();
    const sellerId = String(formData.get("sellerId") || "");
    const radarPlan = String(formData.get("radarPlan") || "");
    const radarDays = parseInt(String(formData.get("radarDays") || "0"), 10) || 0;
    if (!sellerId) return { ok: false, error: "sellerId required" };
    if (!(RADAR_STORED as readonly string[]).includes(radarPlan)) return { ok: false, error: "invalid radar plan" };

    const admin = createSupabaseAdminClient();
    const patch: TablesUpdate<"sellers"> = { radar_plan: radarPlan, updated_at: new Date().toISOString() };

    if (radarPlan === "none") {
      patch.radar_brands_limit = 0;
      patch.radar_active_until = null;
    } else {
      const billingKey = ("radar_" + radarPlan) as RadarPlan;
      patch.radar_brands_limit = RADAR_BRANDS_LIMITS[billingKey] ?? 0;
      const { data: current } = await admin.from("sellers")
        .select("radar_active_until").eq("id", sellerId).maybeSingle();
      const existing = current?.radar_active_until ? new Date(current.radar_active_until) : null;
      const base = existing && existing.getTime() > Date.now() ? existing : new Date();
      const days = radarDays > 0 ? radarDays : 30;
      patch.radar_active_until = new Date(base.getTime() + days * 86400_000).toISOString();
    }

    const { error } = await admin.from("sellers").update(patch).eq("id", sellerId);
    if (error) return { ok: false, error: error.message };

    await logAdminAction(adminEmail, "radar.set", sellerId, { radarPlan, radarDays });
    revalidatePath(`/admin/sellers/${sellerId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

/** Ссылка восстановления пароля (Supabase generateLink type=recovery). */
export async function adminPasswordReset(formData: FormData): Promise<ActionResult> {
  try {
    const adminEmail = await requireAdmin();
    const sellerId = String(formData.get("sellerId") || "");
    const email = String(formData.get("email") || "");
    if (!sellerId || !email) return { ok: false, error: "sellerId/email required" };

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error) return { ok: false, error: error.message };
    const link = (data as { properties?: { action_link?: string } } | null)?.properties?.action_link;

    await logAdminAction(adminEmail, "password.reset_link", sellerId, { email });
    return { ok: true, link };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}

const WORKER_TIMEOUT_MS = 30_000;

/** Форс-ресинк склада: тот же вызов воркера, что и у юзера, но по id без привязки к владельцу. */
export async function adminResyncConnection(formData: FormData): Promise<ActionResult> {
  try {
    const adminEmail = await requireAdmin();
    const connectionId = String(formData.get("connectionId") || "");
    if (!connectionId) return { ok: false, error: "connectionId required" };

    const admin = createSupabaseAdminClient();
    const { data: conn } = await admin.from("data_connections")
      .select("id, source, marketplace, seller_id").eq("id", connectionId).maybeSingle();
    if (!conn) return { ok: false, error: "connection не найдена" };

    const worker = getWorkerConfig();
    if (!worker) return { ok: false, error: "worker не сконфигурирован" };

    let endpoint = "";
    if (conn.source === "google_sheet") endpoint = `/ingest/google-sheet/${connectionId}`;
    else if (conn.source === "marketplace_api" && conn.marketplace === "ozon") endpoint = `/ingest/ozon/${connectionId}`;
    else if (conn.source === "marketplace_api" && conn.marketplace === "wildberries") endpoint = `/ingest/wb/${connectionId}`;
    else if (conn.source === "marketplace_api" && conn.marketplace === "shopify") endpoint = `/ingest/shopify/${connectionId}`;
    else return { ok: false, error: "ресинк недоступен для этого источника (CSV)" };

    const result = await callWorker(worker, endpoint, { method: "POST", timeoutMs: WORKER_TIMEOUT_MS });
    if (!result.ok) {
      return { ok: false, error: result.kind === "timeout" ? "worker не ответил вовремя" : "ошибка связи с worker" };
    }
    if (!result.res.ok) {
      const text = await workerErrorText(result.res);
      return { ok: false, error: text || `worker ${result.res.status}` };
    }

    // recalc после синка (fire-and-forget)
    fireAndForgetRecalc(worker, conn.seller_id);

    await logAdminAction(adminEmail, "connection.resync", conn.seller_id, {
      connectionId, marketplace: conn.marketplace || conn.source,
    });
    revalidatePath(`/admin/sellers/${conn.seller_id}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "failed" };
  }
}
