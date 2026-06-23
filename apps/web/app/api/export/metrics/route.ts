import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { requireUser, jsonError } from "@/lib/auth";
import { getSelectedWarehouse } from "@/lib/warehouse";
import { csvEscape } from "@/lib/csv";
import type { Enums } from "@/lib/database.types";

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
 * Период: 7, 30 (default), 90 дней. Если задан date_from/date_to — метрики
 * пересчитываются на лету за этот период (см. ниже), period=N игнорируется.
 *
 * Multi-warehouse фильтр:
 *   Если ?warehouse_id=<id> указан явно — фильтруем по нему.
 *   Иначе берём выбранный из cookie vs-warehouse.
 *
 * Правка 6 Александра: endpoint теперь уважает все фильтры с /dashboard/skus.
 * Раньше выгружали всё подряд — с тысячами SKU в файле сложно работать.
 * Теперь: SKU из таблицы = SKU в файле (без лимита в 50).
 *
 * Правка Игоря 28.05.2026: добавлена колонка sales_units (фактические продажи
 * за период) — sum abs(delta_stock) для sales_like событий. Соответствует
 * колонке "Продажи" в /dashboard/skus.
 *
 * 04.06.2026 (фикс, синхронно с page.tsx): date_from/date_to больше не фильтруют
 * tvelo_metrics.period_end (это лишь прятало строки, ничего не пересчитывая) —
 * при явном периоде метрики пересчитываются через get_skus_period_metrics:
 * velocity/in_stock/stockout/coverage/sales/lost_revenue за выбранное окно.
 * confirmed_velocity и median_30d при этом пустые (считаются только ночью),
 * confidence/segment/health — свойства SKU из сохранённой метрики.
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

/** Метрики, пересчитанные на лету за произвольный период (get_skus_period_metrics). */
type PeriodRow = {
  velocity: number;
  in_stock_days: number;
  stockout_days: number;
  sales_units: number;
  current_stock: number;
  current_price: number | null;
  coverage_days: number | null;
  lost_revenue: number;
};

export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const limited = enforceRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  try {
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
    if (!wh) return NextResponse.json({ error: "Склад не найден" }, { status: 404 });
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

  // Явный период пользователя → пересчёт метрик на лету (как на /dashboard/skus).
  const customPeriod = !!(dateFrom || dateTo);
  const todayIso = new Date().toISOString().slice(0, 10);
  const defStart = new Date();
  defStart.setUTCDate(defStart.getUTCDate() - periodDays);
  const periodStart = dateFrom ?? defStart.toISOString().slice(0, 10);
  const periodEnd = dateTo ?? todayIso;
  const windowLen = Math.max(1, Math.round(
    (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400_000,
  ) + 1);
  const exportPeriodDays = customPeriod ? windowLen : periodDays;

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
  // Даты сюда не входят: они больше не SQL-фильтр (см. шапку файла).
  const hasAnyMetricFilter = !!(
    dashFilter || segmentFilter || !includeInactive ||
    stockMin !== null || stockMax !== null ||
    oosMin !== null || oosMax !== null
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
      // Тот же 2-веточный предикат, что и в списке (skus/page.tsx): coverage > порог
      // ИЛИ «мёртвый по скорости». Иначе экспорт ≠ список (нарушался бы коммент роута).
      query = query.or(
        `coverage_days.gt.${effectiveThreshold},and(adjusted_velocity.eq.0,current_stock.gt.0,in_stock_days.gte.30)`,
        { foreignTable: "tvelo_metrics" },
      );
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
      query = query.eq("tvelo_metrics.inventory_segment", segmentFilter as Enums<"inventory_segment">);
    }

    if (search) {
      // PostgREST .or(): значение в кавычках — иначе ',' '(' ')' в q ломают
      // структуру фильтра. Экранируем " и \ внутри (см. skus/page.tsx).
      const escaped = search.replace(/["\\]/g, "\\$&");
      query = query.or(`sku.ilike."%${escaped}%",product_name.ilike."%${escaped}%"`);
    }
    if (stockMin !== null) query = query.gte("tvelo_metrics.current_stock", stockMin);
    if (stockMax !== null) query = query.lte("tvelo_metrics.current_stock", stockMax);
    if (oosMin !== null)   query = query.gte("tvelo_metrics.stockout_days", oosMin);
    if (oosMax !== null)   query = query.lte("tvelo_metrics.stockout_days", oosMax);
    // date_from/date_to намеренно не фильтруют period_end — период пересчитывается ниже.

    const { data, error } = await query
      .order("sku")
      .range(fromOffset, fromOffset + PAGE - 1);

    if (error) return jsonError(500, "Не удалось сформировать экспорт", error.message);
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    fromOffset += PAGE;
  }

  // === Пересчёт метрик за явный период (батчами — выборка не ограничена 50) ===
  let periodMetrics: Map<string, PeriodRow> | null = null;
  if (customPeriod && allRows.length > 0) {
    periodMetrics = new Map();
    const ids = allRows.map((p: any) => p.product_id);
    const RPC_BATCH = 500;
    for (let i = 0; i < ids.length; i += RPC_BATCH) {
      const { data: rpcRows, error: rpcError } = await supabase.rpc("get_skus_period_metrics", {
        p_seller_id: user.id,
        p_connection_id: warehouseId ?? null,
        p_period_start: periodStart,
        p_period_end: periodEnd,
        p_product_ids: ids.slice(i, i + RPC_BATCH),
      });
      if (rpcError) return jsonError(500, "Не удалось сформировать экспорт", rpcError.message);
      for (const r of (rpcRows ?? []) as any[]) {
        periodMetrics.set(r.product_id, {
          velocity: Number(r.velocity ?? 0),
          in_stock_days: Number(r.in_stock_days ?? 0),
          stockout_days: Number(r.stockout_days ?? 0),
          sales_units: Number(r.sales_units ?? 0),
          current_stock: Number(r.current_stock ?? 0),
          current_price: r.current_price != null ? Number(r.current_price) : null,
          coverage_days: r.coverage_days != null ? Number(r.coverage_days) : null,
          lost_revenue: Number(r.lost_revenue ?? 0),
        });
      }
    }
  }

  // === Фактические продажи за период (sales_units) — sum sales_like deltas ===
  // То же что в page.tsx для колонки "Продажи". Берём матчем по periodDays:
  // если period_end-period_start ≈ periodDays-1, событие учитывается.
  // Для эффективности — один запрос на все product_ids видимой выборки.
  // При customPeriod не нужно: sales_units приходит из get_skus_period_metrics.
  const salesByProduct: Record<string, number> = {};
  const productIdsForSales = allRows.map((p: any) => p.product_id);
  if (!customPeriod && productIdsForSales.length > 0) {
    // Найдём общий period_start/end из метрик (если есть) — из первой подходящей.
    let salesStart: string | null = null;
    let salesEnd: string | null = null;
    for (const p of allRows) {
      const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
      const matched = metrics.find((m: any) => {
        const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
        return Math.abs(len - (periodDays - 1)) <= 1;
      }) ?? metrics[0];
      if (matched?.period_start && matched?.period_end) {
        salesStart = matched.period_start;
        salesEnd = matched.period_end;
        break;
      }
    }

    if (salesStart && salesEnd) {
      // Supabase .in() с большими массивами — батчим по 1000
      const BATCH = 1000;
      for (let i = 0; i < productIdsForSales.length; i += BATCH) {
        const batch = productIdsForSales.slice(i, i + BATCH);
        const { data: salesEvents } = await supabase
          .from("inventory_events")
          .select("product_id, delta_stock")
          .in("product_id", batch)
          .eq("event_type", "sales_like")
          .gte("event_date", salesStart)
          .lte("event_date", salesEnd);
        for (const ev of (salesEvents ?? []) as any[]) {
          const pid = ev.product_id;
          const delta = Math.abs(Number(ev.delta_stock ?? 0));
          salesByProduct[pid] = (salesByProduct[pid] ?? 0) + delta;
        }
      }
    }
  }

  // === Post-process фильтр по lost_revenue (вычисляемая колонка) ===
  // Нельзя отфильтровать в SQL — считается на лету: adj_vel * stockout_days * price
  const lostFilterActive = (lostMin !== null && lostMin > 0) || lostMax !== null;

  const headers = [
    "sku", "product_name", "period_days", "period_start", "period_end",
    "current_stock", "current_price",
    "confirmed_velocity", "adjusted_velocity", "median_30d_velocity",
    "in_stock_days", "stockout_days", "coverage_days",
    "sales_units",
    "inventory_segment", "sku_health_score", "underestimated_sku",
    "confidence_final", "confidence_initial",
    "confidence_replenishment", "confidence_anomaly",
    "confidence_missing", "confidence_low_history",
    "lost_revenue_estimate",
    "user_notes",
  ];

  const sep = isExcel ? ";" : ",";
  // Единый csvEscape: структурное экранирование + нейтрализация formula-injection.
  const escape = (v: unknown): string => csvEscape(v, sep);

  const lines: string[] = [headers.join(sep)];
  let writtenCount = 0;

  for (const p of allRows) {
    const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
    const matched = metrics.find((m: any) => {
      const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
      return Math.abs(len - (periodDays - 1)) <= 1;
    }) ?? metrics[0];
    const override = periodMetrics?.get(p.product_id) ?? null;

    const userNotes = p.user_notes ?? "";
    const salesUnits = override ? override.sales_units : (salesByProduct[p.product_id] ?? 0);

    if (!matched && !override) {
      // Товар без метрик (возможно только без фильтров) — пропускаем если есть lost-фильтр.
      if (lostFilterActive) continue;
      lines.push([
        escape(p.sku), escape(p.product_name),
        exportPeriodDays, "", "", "", "", "", "", "", "", "", "",
        salesUnits,
        "", "", "",
        "", "", "", "", "", "", "",
        escape(userNotes),
      ].join(sep));
      writtenCount += 1;
      continue;
    }

    // При override: velocity-семейство за выбранный период; confirmed/median
    // пустые (ночные величины), confidence/segment/health — из сохранённой метрики.
    const cb = matched?.confidence_breakdown ?? {};
    const adjVel = override ? override.velocity : Number(matched.adjusted_velocity ?? 0);
    const stockoutDays = override ? override.stockout_days : Number(matched.stockout_days ?? 0);
    const inStockDays = override ? override.in_stock_days : (matched?.in_stock_days ?? "");
    const currentStock = override ? override.current_stock : (matched?.current_stock ?? "");
    const currentPrice = override
      ? Number(override.current_price ?? 0)
      : Number(matched.current_price ?? 0);
    const coverageDays = override
      ? (override.coverage_days ?? "")
      : (matched?.coverage_days ?? "");
    const lostRevenue = override
      ? Math.round(Number(override.lost_revenue ?? 0) * 100) / 100
      : (adjVel > 0 && stockoutDays > 0
          ? Math.round(adjVel * stockoutDays * currentPrice * 100) / 100
          : 0);

    if (lostFilterActive) {
      if (lostMin !== null && lostRevenue <= lostMin) continue;
      if (lostMax !== null && lostRevenue > lostMax) continue;
    }

    lines.push([
      escape(p.sku), escape(p.product_name),
      exportPeriodDays,
      override ? periodStart : matched.period_start,
      override ? periodEnd : matched.period_end,
      currentStock, currentPrice,
      override ? "" : matched.confirmed_velocity,
      override ? adjVel : matched.adjusted_velocity,
      override ? "" : (matched.median_30d_velocity ?? ""),
      inStockDays, stockoutDays, coverageDays,
      salesUnits,
      escape(matched?.inventory_segment ?? ""), matched?.sku_health_score ?? "",
      matched?.underestimated_sku ? "1" : "0",
      matched?.confidence_score ?? "",
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
  const isFiltered = hasAnyMetricFilter || lostFilterActive || !!search || customPeriod;
  const filterSuffix = isFiltered ? "-filtered" : "";
  const baseName = `veloseller-metrics-${exportPeriodDays}d${warehouseSlug}${filterSuffix}-${today}`;

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
  } catch (e) {
    // \u041B\u044E\u0431\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430 \u0411\u0414/\u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0438 \u2014 \u043E\u0431\u0449\u0438\u0439 \u0442\u0435\u043A\u0441\u0442 \u043D\u0430\u0440\u0443\u0436\u0443, \u0434\u0435\u0442\u0430\u043B\u044C \u0432 \u043B\u043E\u0433\u0438.
    return jsonError(500, "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u0444\u043E\u0440\u043C\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u044D\u043A\u0441\u043F\u043E\u0440\u0442", e);
  }
}
