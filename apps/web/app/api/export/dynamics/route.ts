import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/dynamics?period=day|week|month&format=csv|excel
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
 * По умолчанию SKU без активности (velocity = 0 во всех точках) скрываются —
 * Александр явно просил это в правке 12.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const url = new URL(req.url);
  const periodParam = (url.searchParams.get("period") ?? "day").toLowerCase();
  const period = ["day", "week", "month"].includes(periodParam) ? periodParam : "day";
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const isExcel = format === "excel" || format === "xlsx";

  // Грузим всю историю tvelo_metrics для селлера
  type Row = {
    product_id: string;
    period_end: string;
    adjusted_velocity: number;
    products: { sku: string; product_name: string } | { sku: string; product_name: string }[] | null;
  };

  const PAGE = 1000;
  const rows: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("tvelo_metrics")
      .select("product_id,period_end,adjusted_velocity,products!inner(sku,product_name,seller_id)")
      .eq("products.seller_id", user.id)
      .order("period_end", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return new Response(`DB error: ${error.message}`, { status: 500 });
    if (!data || data.length === 0) break;
    rows.push(...(data as any));
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Группируем точки по SKU
  type Bucket = { sku: string; name: string; points: Map<string, number> };
  const bySku = new Map<string, Bucket>();
  for (const r of rows) {
    const product = Array.isArray(r.products) ? r.products[0] : r.products;
    if (!product) continue;
    if (!bySku.has(r.product_id)) {
      bySku.set(r.product_id, { sku: product.sku, name: product.product_name, points: new Map() });
    }
    bySku.get(r.product_id)!.points.set(r.period_end, Number(r.adjusted_velocity));
  }

  // Бакетинг под period: формируем список ключей (колонок) и значение для каждой пары SKU × bucket
  const bucketKeys: string[] = [];
  const bucketize = (period_end: string): string => {
    const d = new Date(period_end);
    if (period === "day") return period_end.slice(0, 10);
    if (period === "week") {
      // ISO неделя YYYY-Www
      const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
      return `${tmp.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
    }
    // month YYYY-MM
    return period_end.slice(0, 7);
  };
  const limit = period === "day" ? 14 : period === "week" ? 12 : 6;

  // Сначала собираем все встречающиеся бакеты и сортируем по убыванию (свежие первые)
  const allBuckets = new Set<string>();
  for (const r of rows) allBuckets.add(bucketize(r.period_end));
  const sortedBuckets = Array.from(allBuckets).sort().reverse().slice(0, limit).reverse();
  bucketKeys.push(...sortedBuckets);

  // Для каждой пары SKU × bucket — avg velocity по точкам внутри
  type Aggregated = { sku: string; name: string; cells: number[]; total: number };
  const aggregated: Aggregated[] = [];
  for (const [, bucket] of bySku) {
    const cells: number[] = [];
    let activeCells = 0;
    for (const key of bucketKeys) {
      const pointsInBucket: number[] = [];
      for (const [period_end, vel] of bucket.points) {
        if (bucketize(period_end) === key) pointsInBucket.push(vel);
      }
      const avg = pointsInBucket.length > 0
        ? pointsInBucket.reduce((a, b) => a + b, 0) / pointsInBucket.length
        : 0;
      cells.push(avg);
      if (avg > 0) activeCells += 1;
    }
    // Скрываем SKU без активности (правка 12 Александра)
    if (activeCells === 0) continue;
    const total = cells.reduce((a, b) => a + b, 0);
    aggregated.push({ sku: bucket.sku, name: bucket.name, cells, total });
  }

  aggregated.sort((a, b) => b.total - a.total);

  // Формирование CSV
  const sep = isExcel ? ";" : ",";
  const escape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(sep) || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
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
}
