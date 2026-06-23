import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/database.types";

export type DashboardVelocity = {
  product_id: string;
  adjusted_velocity: number;
  confidence_score: number | null;
};

// Каноническая строка метрик склада из warehouse_metrics (её же читают графики).
// Раньше KPI-плитки брались из RPC get_warehouse_dashboard_metrics, который
// пересчитывал по-своему и расходился с этой таблицей (см. fetchComputed).
export type WarehouseMetricsRow = Database["public"]["Tables"]["warehouse_metrics"]["Row"];

export type DashboardComputed = {
  wm: WarehouseMetricsRow | null;
  velRows: DashboardVelocity[];
};

/**
 * Штамп свежести метрик склада = max(warehouse_metrics.computed_at) по
 * (seller_id, connection_id). Читается НЕ из кэша, на каждый заход (дёшево —
 * desc-limit 1 по seller+connection), через service-role.
 *
 * ВАЖНО (почему НЕ recalc_jobs.updated_at): recalc_jobs — это лок-таблица,
 * и её updated_at на практике отстаёт от реального пересчёта (наблюдали лаг
 * до 9 дней: метрики пересчитаны, а строка лока не тронута). warehouse_metrics
 * пишется тем же пересчётом, что и tvelo_metrics, поэтому его computed_at честно
 * двигается на каждом пересчёте. Кладётся в ключ кэша агрегатов:
 * новый пересчёт → новый computed_at → промах кэша → свежие данные.
 */
export async function getMetricsStamp(
  sellerId: string,
  connectionId: string,
): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("warehouse_metrics")
    .select("computed_at")
    .eq("seller_id", sellerId)
    .eq("connection_id", connectionId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.computed_at as string | undefined) ?? "none";
}

async function fetchComputed(
  sellerId: string,
  connectionId: string,
  periodDays: number,
): Promise<DashboardComputed> {
  const sb = createServiceClient();
  // C3-фикс: KPI-плитки берём из КАНОНИЧЕСКОЙ warehouse_metrics (та же таблица, что
  // и графики динамики), а НЕ из get_warehouse_dashboard_metrics. RPC пересчитывал
  // метрики иначе и расходился с таблицей/воркером (на проде low_stock 4 vs 37,
  // health 81 vs 75, lost_revenue −7%). Берём строку нужного окна
  // (period_end − period_start ≈ periodDays−1) за последний period_end.
  const targetWin = periodDays - 1; // 7→6, 30→29, 90→89
  const [wmRes, velRes] = await Promise.all([
    sb
      .from("warehouse_metrics")
      .select("*")
      .eq("seller_id", sellerId)
      .eq("connection_id", connectionId)
      .order("period_end", { ascending: false })
      .limit(8), // последний period_end несёт ~3 окна; берём с запасом
    sb.rpc("get_dashboard_velocities", {
      p_seller_id: sellerId,
      p_connection_id: connectionId,
    }),
  ]);
  const rows = wmRes.data ?? [];
  const latestPe = rows[0]?.period_end ?? null;
  const winDays = (r: WarehouseMetricsRow) =>
    Math.round((Date.parse(r.period_end) - Date.parse(r.period_start)) / 86_400_000);
  const wm =
    rows.find((r) => r.period_end === latestPe && Math.abs(winDays(r) - targetWin) <= 1) ??
    rows.find((r) => r.period_end === latestPe) ??
    null;
  const velRows = (velRes.data as DashboardVelocity[] | null) ?? [];
  return { wm, velRows };
}

/**
 * Кэш тяжёлых агрегатов дашборда (2 RPC с оконными функциями по tvelo_metrics).
 * Ключ = [seller_id, склад, период, штамп свежести метрик].
 *
 * БЕЗОПАСНОСТЬ: sellerId ЗДЕСЬ ВСЕГДА должен быть id аутентифицированного
 * пользователя (вызывающий берёт его из auth.getUser()). Обе RPC скоупятся
 * строго по p_seller_id (SECURITY INVOKER, search_path=''), поэтому service-role +
 * явный sellerId возвращает данные ровно этого селлера.
 *
 * revalidate=86400 — страховочный потолок вытеснения.
 */
export function getDashboardComputed(
  sellerId: string,
  connectionId: string,
  periodDays: number,
  stamp: string,
): Promise<DashboardComputed> {
  return unstable_cache(
    () => fetchComputed(sellerId, connectionId, periodDays),
    ["dashboard-computed", sellerId, connectionId, String(periodDays), stamp],
    { revalidate: 86400 },
  )();
}
