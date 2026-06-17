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
 * Штамп последнего пересчёта селлера (recalc_jobs.updated_at).
 *
 * Читается НЕ из кэша, на каждый заход (дёшево — одна индексная
 * строка), через service-role, чтобы не зависеть от RLS recalc_jobs.
 * Кладётся в ключ кэша агрегатов: новый пересчёт меняет updated_at →
 * новый штамп → промах кэша → свежие данные. Инвалидация не нужна.
 */
export async function getRecalcStamp(sellerId: string): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("recalc_jobs")
    .select("updated_at")
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.updated_at as string | undefined) ?? "none";
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
 * Кэш тяжёлых агрегатов дашборда (2 RPC с оконными функциями по
 * tvelo_metrics). Ключ = [seller_id, склад, период, штамп пересчёта].
 *
 * БЕЗОПАСНОСТЬ: sellerId ЗДЕСЬ ВСЕГДА должен быть id аутентифицированного
 * пользователя (вызывающий берёт его из auth.getUser()). Обе RPC
 * скоупятся строго по p_seller_id (SECURITY INVOKER, search_path=''),
 * поэтому service-role + явный sellerId возвращает данные ровно этого селлера.
 *
 * revalidate=86400 — страховочный потолок вытеснения на случай, если штамп
 * не менялся (напр. селлер без строки в recalc_jobs).
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
