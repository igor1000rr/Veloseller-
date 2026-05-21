import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSelectedWarehouse, warehouseKindLabel } from "@/lib/warehouse";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/metrics?period=30&format=csv|xlsx&warehouse_id=<id>
 *
 * Выгружает метрики SKU в CSV (default) или XLSX.
 * Период: 7, 30 (default), 90 дней.
 *
 * Multi-warehouse фильтр (май 2026):
 * - Если ?warehouse_id=<id> указан явно — фильтруем по нему
 * - Иначе берём выбранный из cookie vs-warehouse (решение Александра)
 * - Если выбранный = null (нет складов) — экспорт всех (обратная совместимость)
 *
 * Рейт-лимит: EXPENSIVE (тянет много данных).
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
  const isXlsx = format === "xlsx";

  // Multi-warehouse фильтр
  let warehouseId = url.searchParams.get("warehouse_id");
  let warehouseName = "";
  let warehouseKindStr = "";
  if (!warehouseId) {
    // фоллэк на cookie
    const selected = await getSelectedWarehouse(supabase, user.id);
    if (selected) {
      warehouseId = selected.id;
      warehouseName = selected.name;
      warehouseKindStr = warehouseKindLabel(selected.warehouse_kind);
    }
  } else {
    // Проверяем что этот warehouse принадлежит юзеру и получаем имя для imeni файла
    const { data: wh } = await supabase
      .from("data_connections")
      .select("id, name, warehouse_kind")
      .eq("id", warehouseId)
      .eq("seller_id", user.id)
      .maybeSingle();
    if (!wh) {
      return new Response("Склад не найден", { status: 404 });
    }
    warehouseName = wh.name;
    warehouseKindStr = warehouseKindLabel(wh.warehouse_kind);
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

  // Готовим плоские строки (general purpose — из них мы делаем и CSV, и XLSX)
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

  const flatRows: Array<Record<string, any>> = [];
  for (const p of allRows) {
    const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
    const matched = metrics.find((m: any) => {
      const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
      return Math.abs(len - (periodDays - 1)) <= 1;
    }) ?? metrics[0];

    if (!matched) {
      flatRows.push({
        sku: p.sku, product_name: p.product_name,
        period_days: periodDays,
      });
      continue;
    }

    const cb = matched.confidence_breakdown ?? {};
    const adjVel = Number(matched.adjusted_velocity ?? 0);
    const stockoutDays = Number(matched.stockout_days ?? 0);
    const currentPrice = Number(matched.current_price ?? 0);
    const lostRevenue = adjVel > 0 && stockoutDays > 0
      ? Math.round(adjVel * stockoutDays * currentPrice * 100) / 100
      : 0;

    flatRows.push({
      sku: p.sku, product_name: p.product_name,
      period_days: periodDays,
      period_start: matched.period_start, period_end: matched.period_end,
      current_stock: matched.current_stock, current_price: currentPrice,
      confirmed_velocity: matched.confirmed_velocity, adjusted_velocity: matched.adjusted_velocity,
      median_30d_velocity: matched.median_30d_velocity ?? "",
      in_stock_days: matched.in_stock_days, stockout_days: matched.stockout_days,
      coverage_days: matched.coverage_days ?? "",
      inventory_segment: matched.inventory_segment ?? "",
      sku_health_score: matched.sku_health_score ?? "",
      underestimated_sku: matched.underestimated_sku ? 1 : 0,
      confidence_final: matched.confidence_score,
      confidence_initial: cb.initial ?? "",
      confidence_replenishment: cb.replenishment_like ?? "",
      confidence_anomaly: cb.anomaly_like ?? "",
      confidence_missing: cb.missing_data ?? "",
      confidence_low_history: cb.low_history ?? "",
      lost_revenue_estimate: lostRevenue,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  // Имя файла включает имя склада на латинице (без пробелов)
  const warehouseSlug = warehouseId
    ? "-" + (warehouseName.replace(/[^a-zA-Z0-9А-яа-яЁё]/g, "_").slice(0, 40) || "warehouse")
    : "";
  const baseName = `veloseller-metrics-${periodDays}d${warehouseSlug}-${today}`;

  if (isXlsx) {
    // Динамический import — чтобы xlsx не попадал в client bundle
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // Первый лист — метрики
    const ws = XLSX.utils.json_to_sheet(flatRows, { header: headers });
    // Делаем первую строку (заголовки) freeze + ширины колонок
    ws["!cols"] = headers.map((h) => ({
      wch: h === "product_name" ? 40 : h === "sku" ? 16 : 14,
    }));
    ws["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, "Metrics");

    // Второй лист — сводка
    const summary = [
      ["Параметр", "Значение"],
      ["Дата формирования", today],
      ["Период, дней", periodDays],
      ["Склад", warehouseName || "все склады (legacy)"],
      ["Тип склада", warehouseKindStr || "—"],
      ["Всего SKU в экспорте", flatRows.length],
      ["SKU с метриками", flatRows.filter((r) => r.adjusted_velocity != null).length],
      ["SKU без метрик (мало данных)", flatRows.filter((r) => r.adjusted_velocity == null).length],
      ["Сумма потерянной выручки (оценка)", flatRows.reduce((s, r) => s + (Number(r.lost_revenue_estimate) || 0), 0)],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summary);
    summaryWs["!cols"] = [{ wch: 35 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Сводка");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // CSV (default)
  const csvEscape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [headers.join(",")];
  for (const r of flatRows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(","));
  }
  const csv = lines.join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
