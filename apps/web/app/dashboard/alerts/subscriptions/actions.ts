"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server actions для управления подписками на уведомления.
 *
 * Все операции работают только над подписками текущего юзера — RLS на таблице
 * гарантирует изоляцию, но для defense-in-depth дополнительно фильтруем по seller_id.
 *
 * Типы подписок (kind):
 *   low_stock           — порог coverage_days, default 7
 *   critical_stock      — порог coverage_days, default 3
 *   dead_inventory      — порог coverage_days, default 180
 *   repeated_stockout   — порог stockout_days, default 3
 *   underestimated_sku  — без параметров (внутренний триггер)
 *   sync_error          — без параметров (всегда при ошибке синка)
 *   weekly_report       — день недели day_of_week (1-7)
 *   daily_digest        — час локального времени hour_local (0-23)
 *
 * Каналы (channel): email | telegram
 */
export type NotificationKind =
  | "low_stock"
  | "critical_stock"
  | "dead_inventory"
  | "repeated_stockout"
  | "underestimated_sku"
  | "sync_error"
  | "weekly_report"
  | "daily_digest";

export type NotificationChannel = "email" | "telegram";

type ActionResult = { ok: boolean; error?: string };

/**
 * Создать или обновить подписку. Уникальность (seller, kind, channel)
 * гарантируется constraint'ом в БД — используем upsert через UPDATE/INSERT
 * (Supabase SDK не выводит правильный upsert для composite key из RLS-таблицы,
 * поэтому делаем вручную).
 */
export async function upsertSubscription(
  kind: NotificationKind,
  channel: NotificationChannel,
  enabled: boolean,
  params: Record<string, unknown>,
): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthorized" };

    // Проверяем существует ли запись
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
        .update({ enabled, params })
        .eq("id", existing.id)
        .eq("seller_id", user.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("notification_subscriptions")
        .insert({ seller_id: user.id, kind, channel, enabled, params });
      if (error) return { ok: false, error: error.message };
    }

    revalidatePath("/dashboard/alerts/subscriptions");
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "unknown error" };
  }
}

/**
 * Удалить подписку. После удаления уведомления типа kind через channel
 * больше не приходят. Восстановить можно через "Добавить уведомление".
 */
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

/**
 * Тоггл enabled — быстрая операция включить/выключить без редактирования
 * параметров. Используется на чекбокс в списке.
 */
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
