"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions для управления подписками на отчёты.
 *
 * Все операции работают только над подписками текущего юзера — RLS на таблице
 * гарантирует изоляцию, но для defense-in-depth дополнительно фильтруем по seller_id.
 *
 * Типы отчётов (kind), все формируются Excel по дню недели (day_of_week 1-7):
 *   low_stock           — порог coverage_days_threshold (default 7)
 *   critical_stock      — порог coverage_days_threshold (default 3)
 *   dead_inventory      — порог coverage_days_threshold (default 180)
 *   repeated_stockout   — порог stockout_days_threshold (default 3)
 *   underestimated_sku  — без доп. параметров
 *   sync_error          — без доп. параметров
 *   weekly_report       — сводный отчёт по всему складу
 *
 * Каналы (channel): email | telegram
 * Частота (frequency): daily | weekly | monthly
 *   daily   — каждый день (params.day_of_week игнорируется), 29.05.2026
 *   weekly  — каждую неделю в day_of_week
 *   monthly — в первый day_of_week каждого месяца (today.day <= 7)
 *
 * Дефолт (триггер на инсерт sellers): все 7 kinds включены, email, день=1 (пн),
 * frequency=weekly. Если несколько отчётов на один день — worker формирует один
 * XLSX с листами по типам.
 *
 * daily_digest удалён в миграции reports_refactor_daily_digest_and_day_of_week.
 */
export type NotificationKind =
  | "low_stock"
  | "critical_stock"
  | "dead_inventory"
  | "repeated_stockout"
  | "underestimated_sku"
  | "sync_error"
  | "weekly_report";

export type NotificationChannel = "email" | "telegram";
export type NotificationFrequency = "daily" | "weekly" | "monthly";

type ActionResult = { ok: boolean; error?: string };

export async function upsertSubscription(
  kind: NotificationKind,
  channel: NotificationChannel,
  enabled: boolean,
  params: Record<string, unknown>,
  frequency: NotificationFrequency = "weekly",
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const { data: existing } = await supabase
      .from("notification_subscriptions")
      .select("id")
      .eq("seller_id", user.id)
      .eq("kind", kind)
      .eq("channel", channel)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("notification_subscriptions")
        .update({ enabled, params, frequency })
        .eq("id", existing.id)
        .eq("seller_id", user.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("notification_subscriptions")
        .insert({ seller_id: user.id, kind, channel, enabled, params, frequency });
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/dashboard/alerts/subscriptions");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}

export async function deleteSubscription(subscriptionId: string): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const { error } = await supabase
      .from("notification_subscriptions")
      .delete()
      .eq("id", subscriptionId)
      .eq("seller_id", user.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard/alerts/subscriptions");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}

export async function toggleSubscription(
  subscriptionId: string,
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };

    const { error } = await supabase
      .from("notification_subscriptions")
      .update({ enabled })
      .eq("id", subscriptionId)
      .eq("seller_id", user.id);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard/alerts/subscriptions");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}
