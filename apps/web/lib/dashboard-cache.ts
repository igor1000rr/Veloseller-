import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

export type DashboardVelocity = {
  product_id: string;
  adjusted_velocity: number;
  confidence_score: number | null;
};

export type DashboardComputed = {
  wm: Record<string, any> | null;
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
  const [wmRes, velRes] = await Promise.all([
    sb.rpc("get_warehouse_dashboard_metrics", {
      p_seller_id: sellerId,
      p_connection_id: connectionId,
      p_period_days: periodDays,
    }),
    sb.rpc("get_dashboard_velocities", {
      p_seller_id: sellerId,
      p_connection_id: connectionId,
    }),
  ]);
  const wm = ((wmRes.data as any[] | null) ?? [])[0] ?? null;
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
