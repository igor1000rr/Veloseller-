import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSelectedWarehouse, warehouseKindLabel } from "@/lib/warehouse";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/metrics?period=30&format=csv|excel&warehouse_id=<id>
 *
 * Выгружает метрики SKU в CSV. Две вариации:
 *   format=csv  (default) — чистый CSV (UTF-8 без BOM, разделитель запятая)
 *   format=excel          — CSV с UTF-8 BOM + точка-с-запятой разделитель
 *                           Excel правильно открывает русский текст + разбивает по ячейкам
 *                           без выбора разделителя в диалоге импорта
 *
 * Период: 7, 30 (default), 90 дней.
 *
 * Multi-warehouse фильтр (май 2026):
 * - Если ?warehouse_id=<id> указан явно — фильтруем по нему
 * - Иначе берём выбранный из cookie vs-warehouse
 * - Если выбранный = null (нет складов) — экспорт всех (обратная совместимость)
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
  const periodParam = url.searchParams.get("period") ?? "30";
  const periodDays = ["7", "30", "90"].includes(periodParam) ? parseInt(periodParam) : 30;
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const isExcel = format === "excel" || format === "xlsx";

  // Multi-warehouse фильтр
  let warehouseId = url.searchParams.get("warehouse_id");
  let warehouseName = "";
  if (!warehouseId) {
    const selected = await getSelectedWarehouse(supabase, user.id);
    if (selected) {
      warehouseId = selected.id;
      warehouseName = selected.name;
    }
  } else {
    const { data: wh } = await supabase
      .from("data_connections")
      .select("id, name")
      .eq("id", warehouseId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (!wh) {
      return new Response("Склад не найден", { status: 404 });
    }
    warehouseName = wh.name;
  }

  const PAGE = 1000;
  const allRows: any[] = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from("products")
      .select(`
        product_id, sku, product_name, connection_id,
        tvelo_metrics (
          confirmed_velocity, adjusted_velocity, median_30d_velocity,
          confidence_score, confidence_breakdown,
          stockout_days, in_stock_days, coverage_days,
          current_stock, current_price,
          inventory_segment, sku_health_score, underestimated_sku,
          period_start, period_end
        )
      `)
      .eq("seller_id", user.id);

    if (warehouseId) {
      query = query.eq("connection_id", warehouseId);
    }

    const { data, error } = await query
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

  const headers = [
    "sku", "product_name", "period_days", "period_start", "period_end",
    "current_stock", "current_price",
    "confirmed_velocity", "adjusted_velocity", "median_30d_velocity",
    "in_stock_days", "stockout_days", "coverage_days",
    "inventory_segment", "sku_health_score", "underestimated_sku",
    "confidence_final", "confidence_initial",
    "confidence_replenishment", "confidence_anomaly",
    "confidence_missing", "confidence_low_history",
    "lost_revenue_estimate",
  ];

  // Разделитель и экранирование
  const sep = isExcel ? ";" : ",";
  const escape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(sep) || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [headers.join(sep)];
  for (const p of allRows) {
    const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
    const matched = metrics.find((m: any) => {
      const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
      return Math.abs(len - (periodDays - 1)) <= 1;
    }) ?? metrics[0];

    if (!matched) {
      lines.push([
        escape(p.sku), escape(p.product_name),
        periodDays, "", "", "", "", "", "", "", "", "", "", "", "", "",
        "", "", "", "", "", "", "",
      ].join(sep));
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
      escape(p.sku), escape(p.product_name),
      periodDays, matched.period_start, matched.period_end,
      matched.current_stock, currentPrice,
      matched.confirmed_velocity, matched.adjusted_velocity, matched.median_30d_velocity ?? "",
      matched.in_stock_days, matched.stockout_days, matched.coverage_days ?? "",
      escape(matched.inventory_segment ?? ""), matched.sku_health_score ?? "",
      matched.underestimated_sku ? "1" : "0",
      matched.confidence_score,
      cb.initial ?? "", cb.replenishment_like ?? "", cb.anomaly_like ?? "",
      cb.missing_data ?? "", cb.low_history ?? "",
      lostRevenue,
    ].join(sep));
  }

  const csv = lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const warehouseSlug = warehouseId
    ? "-" + (warehouseName.replace(/[^a-zA-Z0-9А-яа-яЁё]/g, "_").slice(0, 40) || "warehouse")
    : "";
  const baseName = `veloseller-metrics-${periodDays}d${warehouseSlug}-${today}`;

  if (isExcel) {
    // CSV с UTF-8 BOM + точка-с-запятой разделитель — Excel открывает как таблицу
    // BOM = 0xEF 0xBB 0xBF — сигнал Excel'ю что файл UTF-8 (иначе кракозябры)
    // .xls extension — Excel по умолчанию откроет без диалога импорта
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
