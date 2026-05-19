import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/metrics?period=30
 *
 * Выгружает все метрики SKU в CSV для сверки с реальными данными.
 * Период: 7, 30 (default), 90 дней.
 *
 * Включает: TVelo, confirmed/adjusted/median, OOS дни, покрытие, confidence
 * с разбивкой (initial/repl/anom/missing/low_history/final), health, segment,
 * underestimated flag, ориентировочный lost_revenue.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "30";
  const periodDays = ["7", "30", "90"].includes(periodParam) ? parseInt(periodParam) : 30;

  // Тянем продукты + метрики с пагинацией fetch_all-стилем
  // Supabase лимит 1000 строк — пагинируем явно
  const PAGE = 1000;
  const allRows: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(`
        product_id, sku, product_name,
        tvelo_metrics (
          confirmed_velocity, adjusted_velocity, median_30d_velocity,
          confidence_score, confidence_breakdown,
          stockout_days, in_stock_days, coverage_days,
          current_stock, current_price,
          inventory_segment, sku_health_score, underestimated_sku,
          period_start, period_end
        )
      `)
      .eq("seller_id", user.id)
      .order("sku")
      .range(from, from + PAGE - 1);

    if (error) {
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Заголовки CSV — все важные для аудита поля
  const headers = [
    "sku",
    "product_name",
    "period_days",
    "period_start",
    "period_end",
    "current_stock",
    "current_price",
    "confirmed_velocity",
    "adjusted_velocity",
    "median_30d_velocity",
    "in_stock_days",
    "stockout_days",
    "coverage_days",
    "inventory_segment",
    "sku_health_score",
    "underestimated_sku",
    "confidence_final",
    "confidence_initial",
    "confidence_replenishment",
    "confidence_anomaly",
    "confidence_missing",
    "confidence_low_history",
    "lost_revenue_estimate",
  ];

  const csvEscape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [headers.join(",")];

  for (const p of allRows) {
    // Выбираем метрику нужного периода (если их несколько)
    const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
    const matched = metrics.find((m: any) => {
      const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
      return Math.abs(len - (periodDays - 1)) <= 1;
    }) ?? metrics[0];

    if (!matched) {
      // SKU без метрик — пустая строка с базовыми полями
      lines.push([
        csvEscape(p.sku), csvEscape(p.product_name),
        periodDays, "", "", "", "", "", "", "", "", "", "", "", "", "",
        "", "", "", "", "", "", "",
      ].join(","));
      continue;
    }

    const cb = matched.confidence_breakdown ?? {};
    const adjVel = Number(matched.adjusted_velocity ?? 0);
    const stockoutDays = Number(matched.stockout_days ?? 0);
    const currentPrice = Number(matched.current_price ?? 0);
    const lostRevenue = adjVel > 0 && stockoutDays > 0
      ? Math.round(adjVel * stockoutDays * currentPrice * 100) / 100
      : 0;

    lines.push([
      csvEscape(p.sku),
      csvEscape(p.product_name),
      periodDays,
      matched.period_start,
      matched.period_end,
      matched.current_stock,
      currentPrice,
      matched.confirmed_velocity,
      matched.adjusted_velocity,
      matched.median_30d_velocity ?? "",
      matched.in_stock_days,
      matched.stockout_days,
      matched.coverage_days ?? "",
      matched.inventory_segment ?? "",
      matched.sku_health_score ?? "",
      matched.underestimated_sku ? "1" : "0",
      matched.confidence_score,
      cb.initial ?? "",
      cb.replenishment_like ?? "",
      cb.anomaly_like ?? "",
      cb.missing_data ?? "",
      cb.low_history ?? "",
      lostRevenue,
    ].join(","));
  }

  const csv = lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const filename = `veloseller-metrics-${periodDays}d-${today}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
