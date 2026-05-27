import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Проверка тарифа Radar. Возвращает либо ошибку (если none или истёк),
 * либо seller-данные для последующего использования.
 *
 * Использование в API-роутах:
 *   const auth = await requireRadarAccess();
 *   if (auth instanceof NextResponse) return auth;
 *   const { sb, userId, plan, brandsLimit } = auth;
 */
export async function requireRadarAccess() {
  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: seller } = await sb
    .from("sellers")
    .select("radar_plan,radar_brands_limit,radar_active_until")
    .eq("id", user.id)
    .maybeSingle();

  const plan = (seller as any)?.radar_plan ?? "none";
  const brandsLimit = (seller as any)?.radar_brands_limit ?? 0;
  const activeUntil = (seller as any)?.radar_active_until;

  if (plan === "none") {
    return NextResponse.json({
      error: "Radar plan not active. Subscribe to use this feature.",
      code: "RADAR_PLAN_NONE",
    }, { status: 403 });
  }

  // Проверка что подписка не истекла. activeUntil null для бессрочных,
  // дата для trial и paid.
  if (activeUntil && new Date(activeUntil) < new Date()) {
    return NextResponse.json({
      error: "Radar plan expired. Please renew subscription.",
      code: "RADAR_PLAN_EXPIRED",
      expired_at: activeUntil,
    }, { status: 403 });
  }

  return { sb, userId: user.id, plan, brandsLimit };
}

/**
 * Нормализация имени бренда: для UNIQUE-индекса и cache_key.
 * "Dyson V15" → "dyson v15", "  BOSCH  " → "bosch".
 * Сохраняем пробелы внутри (чтобы "hp laser" и "hplaser" были разными).
 */
export function normalizeBrandName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Нормализация запроса для дедупликации: lowercase, схлопнутые пробелы.
 */
export function normalizeQueryText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
