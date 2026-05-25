import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getSelectedWarehouse } from "@/lib/warehouse";

export const dynamic = "force-dynamic";

/**
 * GET /api/export/metrics?period=30&format=csv|excel&warehouse_id=<id>
 *                       &q=&segment=&filter=&threshold=&include_inactive=1
 *                       &stock_min=&stock_max=&oos_min=&oos_max=
 *                       &lost_min=&lost_max=&date_from=&date_to=
 *
 * Выгружает метрики SKU в CSV. Две вариации:
 *   format=csv  (default) — чистый CSV (UTF-8 без BOM, разделитель запятая)
 *   format=excel          — CSV с UTF-8 BOM + точка-с-запятой разделитель
 *
 * Период: 7, 30 (default), 90 дней.
 *
 * Multi-warehouse фильтр:
 *   Если ?warehouse_id=<id> указан явно — фильтруем по нему.
 *   Иначе берём выбранный из cookie vs-warehouse.
 *
 * Правка 6 Александра: endpoint теперь уважает все фильтры с /dashboard/skus.
 * Раньше выгружали всё подряд — с тысячами SKU в файле сложно работать.
 * Теперь: SKU из таблицы = SKU в файле (без лимита в 50).
 *
 * Логика фильтров должна быть синхронизирована с apps/web/app/dashboard/skus/page.tsx.
 * Если там появятся новые фильтры — добавлять и сюда.
 */

type DashboardFilter =
  | "low_stock"
  | "lost_revenue"
  | "dead_inventory"
  | "oos"
  | "inactive"
  | "frequently_oos"
  | "inventory_concentration"
  | "demand_concentration";

const DASHBOARD_FILTERS: ReadonlySet<DashboardFilter> = new Set([
  "low_stock", "lost_revenue", "dead_inventory", "oos", "inactive",
  "frequently_oos", "inventory_concentration", "demand_concentration",
]);

function isDashboardFilter(s: string | null): s is DashboardFilter {
  return s !== null && DASHBOARD_FILTERS.has(s as DashboardFilter);
}

function parseIntOrNull(s: string | null): number | null {
  if (s == null || s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateOrNull(s: string | null): string | null {
  if (s == null || s === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function defaultThresholdFor(filter: DashboardFilter): number | null {
  if (filter === "low_stock") return 7;
  if (filter === "dead_inventory") return 180;
  if (filter === "frequently_oos") return 15;
  return null;
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "30";
  const periodDays = ["7", "30", "90"].includes(periodParam) ? parseInt(periodParam) : 30;
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
  const isExcel = format === "excel" || format === "xlsx";

  // Решаем склад: query > cookie.
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
    if (!wh) return new Response("Склад не найден", { status: 404 });
    warehouseName = wh.name;
  }

  // Читаем все фильтры (синхроны с page.tsx)
  const segmentFilter = url.searchParams.get("segment") ?? "";
  const dashFilterRaw = url.searchParams.get("filter");
  const dashFilter: DashboardFilter | null = isDashboardFilter(dashFilterRaw) ? dashFilterRaw : null;
  const includeInactiveParam = url.searchParams.get("include_inactive") === "1";
  const includeInactive = includeInactiveParam || dashFilter === "inactive";

  const customThreshold = parseIntOrNull(url.searchParams.get("threshold"));
  const effectiveThreshold = dashFilter
    ? (customThreshold ?? defaultThresholdFor(dashFilter))
    : null;

  const search = (url.searchParams.get("q") ?? "").trim();
  const stockMin = parseIntOrNull(url.searchParams.get("stock_min"));
  const stockMax = parseIntOrNull(url.searchParams.get("stock_max"));
  const oosMin = parseIntOrNull(url.searchParams.get("oos_min"));
  const oosMax = parseIntOrNull(url.searchParams.get("oos_max"));
  const lostMin = parseIntOrNull(url.searchParams.get("lost_min"));
  const lostMax = parseIntOrNull(url.searchParams.get("lost_max"));
  const dateFrom = parseDateOrNull(url.searchParams.get("date_from"));
  const dateTo = parseDateOrNull(url.searchParams.get("date_to"));

  // Концентрационные фильтры — RPC возвращает топ-N product_ids
  let concentrationIds: string[] | null = null;
  if (dashFilter === "inventory_concentration" || dashFilter === "demand_concentration") {
    const kind = dashFilter === "inventory_concentration" ? "inventory" : "demand";
    const { data: idsRows } = await supabase.rpc("get_concentration_product_ids", {
      p_seller_id: user.id,
      p_connection_id: warehouseId,
      p_kind: kind,
    });
    concentrationIds = ((idsRows as any[] | null) ?? []).map((r: any) => r.product_id);
  }

  // При применённых фильтрах на метрики нужен !inner.
  // Без фильтров — выгружаем все товары (даже без метрик) — как раньше.
  const hasAnyMetricFilter = !!(
    dashFilter || segmentFilter || !includeInactive ||
    stockMin !== null || stockMax !== null ||
    oosMin !== null || oosMax !== null ||
    dateFrom || dateTo
  );
  const tveloJoin = hasAnyMetricFilter ? "tvelo_metrics!inner" : "tvelo_metrics";

  const PAGE = 1000;
  const allRows: any[] = [];
  let fromOffset = 0;

  while (true) {
    let query = supabase
      .from("products")
      .select(`
        product_id, sku, product_name, connection_id, user_notes,
        ${tveloJoin} (
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

    // === Дашборд-фильтры (синхронно с page.tsx) ===
    if (dashFilter === "low_stock") {
      query = query
        .lte("tvelo_metrics.coverage_days", effectiveThreshold!)
        .gt("tvelo_metrics.current_stock", 0);
    } else if (dashFilter === "lost_revenue") {
      query = query
        .gt("tvelo_metrics.stockout_days", 0)
        .gt("tvelo_metrics.adjusted_velocity", 0);
    } else if (dashFilter === "dead_inventory") {
      query = query.gt("tvelo_metrics.coverage_days", effectiveThreshold!);
    } else if (dashFilter === "oos") {
      query = query
        .eq("tvelo_metrics.current_stock", 0)
        .gt("tvelo_metrics.adjusted_velocity", 0);
    } else if (dashFilter === "inactive") {
      query = query
        .eq("tvelo_metrics.current_stock", 0)
        .eq("tvelo_metrics.adjusted_velocity", 0);
    } else if (dashFilter === "frequently_oos") {
      query = query.gt("tvelo_metrics.stockout_days", effectiveThreshold!);
    } else if (dashFilter === "inventory_concentration" || dashFilter === "demand_concentration") {
      const ids = concentrationIds ?? [];
      if (ids.length === 0) {
        query = query.in("product_id", ["00000000-0000-0000-0000-000000000000"]);
      } else {
        query = query.in("product_id", ids);
      }
    } else if (!includeInactive) {
      query = query.or("current_stock.gt.0,adjusted_velocity.gt.0", { foreignTable: "tvelo_metrics" });
    }

    if (segmentFilter) {
      query = query.eq("tvelo_metrics.inventory_segment", segmentFilter);
    }

    if (search) {
      const escaped = search.replace(/[%_]/g, "\\$&");
      query = query.or(`sku.ilike.%${escaped}%,product_name.ilike.%${escaped}%`);
    }
    if (stockMin !== null) query = query.gte("tvelo_metrics.current_stock", stockMin);
    if (stockMax !== null) query = query.lte("tvelo_metrics.current_stock", stockMax);
    if (oosMin !== null)   query = query.gte("tvelo_metrics.stockout_days", oosMin);
    if (oosMax !== null)   query = query.lte("tvelo_metrics.stockout_days", oosMax);
    if (dateFrom)          query = query.gte("tvelo_metrics.period_end", dateFrom);
    if (dateTo)            query = query.lte("tvelo_metrics.period_end", dateTo);

    const { data, error } = await query
      .order("sku")
      .range(fromOffset, fromOffset + PAGE - 1);

    if (error) return new Response(`DB error: ${error.message}`, { status: 500 });
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    fromOffset += PAGE;
  }

  // === Post-process фильтр по lost_revenue (вычисляемая колонка) ===
  // Нельзя отфильтровать в SQL — считается на лету: adj_vel * stockout_days * price
  const lostFilterActive = (lostMin !== null && lostMin > 0) || lostMax !== null;

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
    "user_notes",
  ];

  const sep = isExcel ? ";" : ",";
  const escape = (v: any): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(sep) || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines: string[] = [headers.join(sep)];
  let writtenCount = 0;

  for (const p of allRows) {
    const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
    const matched = metrics.find((m: any) => {
      const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
      return Math.abs(len - (periodDays - 1)) <= 1;
    }) ?? metrics[0];

    const userNotes = p.user_notes ?? "";

    if (!matched) {
      // Товар без метрик (возможно только без фильтров) — пропускаем если есть lost-фильтр.
      if (lostFilterActive) continue;
      lines.push([
        escape(p.sku), escape(p.product_name),
        periodDays, "", "", "", "", "", "", "", "", "", "", "", "", "",
        "", "", "", "", "", "", "",
        escape(userNotes),
      ].join(sep));
      writtenCount += 1;
      continue;
    }

    const cb = matched.confidence_breakdown ?? {};
    const adjVel = Number(matched.adjusted_velocity ?? 0);
    const stockoutDays = Number(matched.stockout_days ?? 0);
    const currentPrice = Number(matched.current_price ?? 0);
    const lostRevenue = adjVel > 0 && stockoutDays > 0
      ? Math.round(adjVel * stockoutDays * currentPrice * 100) / 100
      : 0;

    if (lostFilterActive) {
      if (lostMin !== null && lostRevenue <= lostMin) continue;
      if (lostMax !== null && lostRevenue > lostMax) continue;
    }

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
      escape(userNotes),
    ].join(sep));
    writtenCount += 1;
  }

  const csv = lines.join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const warehouseSlug = warehouseId
    ? "-" + (warehouseName.replace(/[^a-zA-Z0-9А-яа-яЁё]/g, "_").slice(0, 40) || "warehouse")
    : "";
  // Если применены фильтры — в имени файла пометка "-filtered".
  const isFiltered = hasAnyMetricFilter || lostFilterActive || !!search;
  const filterSuffix = isFiltered ? "-filtered" : "";
  const baseName = `veloseller-metrics-${periodDays}d${warehouseSlug}${filterSuffix}-${today}`;

  const respHeaders: Record<string, string> = {
    "Content-Disposition": `attachment; filename="${baseName}.csv"`,
    "Cache-Control": "no-store",
    "X-Filter-Applied": isFiltered ? "1" : "0",
    "X-Row-Count": String(writtenCount),
  };

  if (isExcel) {
    const bom = "\uFEFF";
    respHeaders["Content-Type"] = "application/vnd.ms-excel; charset=utf-8";
    return new Response(bom + csv, { headers: respHeaders });
  }
  respHeaders["Content-Type"] = "text/csv; charset=utf-8";
  return new Response(csv, { headers: respHeaders });
}
