import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser, jsonError } from "@/lib/auth";
import { getSelectedWarehouse } from "@/lib/warehouse";
import { csvEscape } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/dynamics?period=day|week|month&format=csv|excel&warehouse_id=uuid
 *
 * Экспорт динамики скоростей продаж по SKU за разные периоды агрегации.
 *
 * Период:
 *   day   — последние 14 дней (точечные снапшоты)
 *   week  — последние 12 недель (avg по неделе)
 *   month — последние 6 месяцев (avg по месяцу)
 *
 * Формат:
 *   csv   — UTF-8 без BOM, разделитель запятая
 *   excel — UTF-8 с BOM + точка-с-запятой (Excel сразу открывает как таблицу)
 *
 * Склад: если warehouse_id передан в query — фильтруем по нему, иначе берём
 * выбранный из cookie vs-warehouse, иначе — первый склад пользователя.
 *
 * По умолчанию SKU без активности (velocity = 0 во всех точках) скрываются —
 * Александр явно просил это в правке 12.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  try {
  const url = new URL(req.url);
  const periodParam = (url.searchParams.get("period") ?? "day").toLowerCase();
  const period = (["day", "week", "month"].includes(periodParam) ? periodParam : "day") as "day" | "week" | "month";
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const isExcel = format === "excel" || format === "xlsx";

  // Определяем склад: query > cookie > первый.
  const warehouseIdParam = url.searchParams.get("warehouse_id");
  let connectionId: string | null = null;
  if (warehouseIdParam) {
    // Валидируем что склад принадлежит пользователю.
    const { data: dc } = await supabase
      .from("data_connections")
      .select("id")
      .eq("id", warehouseIdParam)
      .eq("seller_id", user.id)
      .maybeSingle();
    connectionId = dc?.id ?? null;
  }
  if (!connectionId) {
    const selected = await getSelectedWarehouse(supabase, user.id);
    connectionId = selected?.id ?? null;
  }

  // Lookback по дням — соответствует UI page.tsx (day=30, week=100, month=210).
  const lookbackDays = period === "day" ? 30 : period === "week" ? 100 : 210;
  const lookbackIso = new Date(Date.now() - lookbackDays * 86400_000).toISOString().slice(0, 10);

  type Row = {
    product_id: string;
    period_end: string;
    adjusted_velocity: number;
    products: { sku: string; product_name: string } | { sku: string; product_name: string }[] | null;
  };

  // Один запрос с фильтром по складу + дате. БЕЗ пагинации.
  let query = supabase
    .from("tvelo_metrics")
    .select("product_id,period_end,adjusted_velocity,products!inner(sku,product_name,seller_id,connection_id)")
    .eq("products.seller_id", user.id)
    .gte("period_end", lookbackIso)
    .order("period_end", { ascending: true });

  if (connectionId) {
    query = query.eq("products.connection_id", connectionId);
  }

  const { data: rowsData, error } = await query;
  if (error) return jsonError(500, "Не удалось сформировать экспорт", error.message);
  const rows = (rowsData ?? []) as Row[];

  // bucketize
  const bucketize = (period_end: string): string => {
    if (period === "day") return period_end.slice(0, 10);
    if (period === "week") {
      const d = new Date(period_end);
      const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
      return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    }
    return period_end.slice(0, 7);
  };
  const limit = period === "day" ? 14 : period === "week" ? 12 : 6;

  // Группировка с одновременной бакетизацией — экономит O(N×M) операций bucketize.
  type Bucket = { sku: string; name: string; byBucket: Map<string, number[]> };
  const bySku = new Map<string, Bucket>();
  const allBuckets = new Set<string>();
  for (const r of rows) {
    const product = Array.isArray(r.products) ? r.products[0] : r.products;
    if (!product) continue;
    const key = bucketize(r.period_end);
    allBuckets.add(key);

    let entry = bySku.get(r.product_id);
    if (!entry) {
      entry = { sku: product.sku, name: product.product_name, byBucket: new Map() };
      bySku.set(r.product_id, entry);
    }
    const arr = entry.byBucket.get(key);
    if (arr) arr.push(Number(r.adjusted_velocity));
    else entry.byBucket.set(key, [Number(r.adjusted_velocity)]);
  }

  const sortedBuckets = Array.from(allBuckets).sort();
  const bucketKeys = sortedBuckets.slice(-limit);

  // Для каждого SKU — avg per bucket, один проход.
  type Aggregated = { sku: string; name: string; cells: number[]; total: number };
  const aggregated: Aggregated[] = [];
  for (const [, bucket] of bySku) {
    const cells: number[] = [];
    let activeCells = 0;
    for (const key of bucketKeys) {
      const vels = bucket.byBucket.get(key);
      const avg = vels && vels.length > 0
        ? vels.reduce((a, b) => a + b, 0) / vels.length
        : 0;
      cells.push(avg);
      if (avg > 0) activeCells += 1;
    }
    if (activeCells === 0) continue;
    const total = cells.reduce((a, b) => a + b, 0);
    aggregated.push({ sku: bucket.sku, name: bucket.name, cells, total });
  }

  aggregated.sort((a, b) => b.total - a.total);

  // Формирование CSV
  const sep = isExcel ? ";" : ",";
  // Единый csvEscape: структурное экранирование + нейтрализация formula-injection.
  const escape = (v: unknown): string => csvEscape(v, sep);
  const headers = ["sku", "product_name", ...bucketKeys];
  const lines: string[] = [headers.map(escape).join(sep)];
  for (const a of aggregated) {
    const cells = a.cells.map(v => v > 0 ? v.toFixed(2) : "0");
    lines.push([escape(a.sku), escape(a.name), ...cells].join(sep));
  }
  const csv = lines.join("\n");

  const today = new Date().toISOString().slice(0, 10);
  const baseName = `veloseller-dynamics-${period}-${today}`;

  if (isExcel) {
    const bom = "\uFEFF";
    return new Response(bom + csv, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseName}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
  } catch (e) {
    // Любая ошибка БД/обработки — общий текст наружу, деталь в логи.
    return jsonError(500, "Не удалось сформировать экспорт", e);
  }
}
