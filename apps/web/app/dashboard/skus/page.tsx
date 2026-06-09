import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../_components/Icons";
import { getSelectedWarehouse, warehouseKindLabel } from "@/lib/warehouse";
import { getPreHolidayWindow } from "@/lib/holidays";
import { SkusFilters, type FilterRanges } from "./SkusFilters";
import { SearchInput } from "./SearchInput";
import { DashFilterChip } from "./DashFilterChip";
import { ColumnsPicker } from "./ColumnsPicker";
import { SkusTable, type PeriodMetricsRow } from "./SkusTable";
import { t } from "@/lib/i18n";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";

const PAGE_SIZE = 50;

const SEGMENTS = [
  { value: "",                    label: t("sku.segment.all") },
  { value: "fast_movers",         label: t("sku.segment.fast") },
  { value: "stable",              label: t("sku.segment.stable") },
  { value: "slow_movers",         label: t("sku.segment.slow") },
  { value: "dead_inventory_risk", label: t("sku.segment.dead") },
];

type DashboardFilter =
  | "low_stock"
  | "lost_revenue"
  | "dead_inventory"
  | "oos"
  | "inactive"
  | "active"
  | "frequently_oos"
  | "inventory_concentration"
  | "demand_concentration";

const DASHBOARD_FILTERS: ReadonlySet<DashboardFilter> = new Set([
  "low_stock",
  "lost_revenue",
  "dead_inventory",
  "oos",
  "inactive",
  "active",
  "frequently_oos",
  "inventory_concentration",
  "demand_concentration",
]);

function isDashboardFilter(s: string | undefined): s is DashboardFilter {
  return s !== undefined && DASHBOARD_FILTERS.has(s as DashboardFilter);
}

function parseIntOrNull(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDateOrNull(s: string | undefined): string | null {
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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}

export default async function SkusPage({ searchParams }: {
  searchParams: Promise<{
    page?: string;
    segment?: string;
    reorder_days?: string;
    period?: string;
    filter?: string;
    include_inactive?: string;
    threshold?: string;
    q?: string;
    stock_min?: string;
    stock_max?: string;
    oos_min?: string;
    oos_max?: string;
    lost_min?: string;
    lost_max?: string;
    coverage_min?: string;
    coverage_max?: string;
    date_from?: string;
    date_to?: string;
    brand?: string;
    category?: string;
    tag?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const segmentFilter = sp.segment ?? "";
  const reorderDays = Math.max(1, parseInt(sp.reorder_days ?? "30", 10) || 30);
  const userExplicitPeriod = sp.period === "7" || sp.period === "30" || sp.period === "90";
  const periodDays = userExplicitPeriod ? parseInt(sp.period!) : 30;
  const dashFilter: DashboardFilter | null = isDashboardFilter(sp.filter) ? sp.filter : null;
  const includeInactive = sp.include_inactive === "1" || dashFilter === "inactive";

  const customThreshold = parseIntOrNull(sp.threshold);
  const effectiveThreshold = dashFilter
    ? (customThreshold ?? defaultThresholdFor(dashFilter))
    : null;

  const search = (sp.q ?? "").trim();
  const stockMin = parseIntOrNull(sp.stock_min);
  const stockMax = parseIntOrNull(sp.stock_max);
  const oosMin = parseIntOrNull(sp.oos_min);
  const oosMax = parseIntOrNull(sp.oos_max);
  const lostMin = parseIntOrNull(sp.lost_min);
  const lostMax = parseIntOrNull(sp.lost_max);
  // Новый фильтр (Александр 01.06.2026): "Дней до окончания остатков"
  // — по coverage_days. Очень важный для закупок.
  const coverageMin = parseIntOrNull(sp.coverage_min);
  const coverageMax = parseIntOrNull(sp.coverage_max);
  const dateFrom = parseDateOrNull(sp.date_from);
  const dateTo = parseDateOrNull(sp.date_to);
  // Теги (#6): точный фильтр по бренду/категории (значения из API).
  const brandFilter = (sp.brand ?? "").trim();
  const categoryFilter = (sp.category ?? "").trim();
  // Произвольный пользовательский тег (#6): products.tags @> [tag].
  const tagFilter = (sp.tag ?? "").trim();

  const today = new Date();
  const preHoliday = userExplicitPeriod ? null : getPreHolidayWindow(today);
  let defaultDateTo: string;
  let defaultDateFrom: string;
  let preHolidayLabel: string | null = null;
  if (preHoliday) {
    defaultDateTo = isoDate(today);
    defaultDateFrom = preHoliday.windowStart;
    preHolidayLabel = t("sku.preHoliday.label", { days: preHoliday.daysBefore, holiday: preHoliday.holidayName });
  } else {
    defaultDateTo = isoDate(today);
    defaultDateFrom = daysAgo(periodDays);
  }

  // 04.06.2026 (фикс «Рассчитать не считает»): раньше date_from/date_to лишь
  // фильтровали сохранённые tvelo_metrics по period_end — TVelo/Продажи/Покрытие
  // оставались из ночного 30-дневного окна и при выборе только дат «ничего не
  // происходило». Теперь явный период пользователя пересчитывает метрики на лету
  // через get_skus_period_metrics — тем же механизмом, что предпраздничное окно.
  const customPeriod = !!(dateFrom || dateTo);
  const periodStart = dateFrom ?? defaultDateFrom;
  const periodEnd = dateTo ?? defaultDateTo;

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const selected = await getSelectedWarehouse(supabase, user.id);
  const warehouseCreatedAt = selected?.created_at ?? null;

  const { data: rangesRows } = await supabase.rpc("get_skus_filter_ranges", {
    p_seller_id: user.id,
    p_connection_id: selected?.id ?? null,
    p_period_days: periodDays,
  });
  const rangesRaw = (rangesRows as any[] | null)?.[0];
  const filterRanges: FilterRanges = {
    stockMin: Number(rangesRaw?.stock_min ?? 0),
    stockMax: Number(rangesRaw?.stock_max ?? 0),
    oosMin: Number(rangesRaw?.oos_min ?? 0),
    oosMax: Number(rangesRaw?.oos_max ?? 0),
    lostMin: Number(rangesRaw?.lost_min ?? 0),
    lostMax: Number(rangesRaw?.lost_max ?? 0),
    // coverage_min/coverage_max — placeholder'ы для нового фильтра.
    // Если RPC ещё не возвращает эти поля — fallback к разумным дефолтам.
    coverageMin: Number(rangesRaw?.coverage_min ?? 0),
    coverageMax: Number(rangesRaw?.coverage_max ?? 365),
  };

  let concentrationIds: string[] | null = null;
  if (dashFilter === "inventory_concentration" || dashFilter === "demand_concentration") {
    const kind = dashFilter === "inventory_concentration" ? "inventory" : "demand";
    const { data: idsRows } = await supabase.rpc("get_concentration_product_ids", {
      p_seller_id: user.id,
      p_connection_id: selected?.id ?? null,
      p_kind: kind,
    });
    concentrationIds = ((idsRows as any[] | null) ?? []).map((r: any) => r.product_id);
  }

  let productsQuery = supabase
    .from("products")
    .select(`
      product_id, sku, product_name, user_notes, brand, category, tags,
      tvelo_metrics!inner (
        confirmed_velocity, adjusted_velocity, median_30d_velocity, confidence_score,
        stockout_days, in_stock_days, coverage_days, current_stock,
        current_price, inventory_segment, sku_health_score, underestimated_sku,
        period_start, period_end
      )
    `, { count: "exact" })
    .eq("seller_id", user.id);

  if (selected) {
    productsQuery = productsQuery.eq("connection_id", selected.id);
  }

  if (dashFilter === "low_stock") {
    productsQuery = productsQuery
      .lte("tvelo_metrics.coverage_days", effectiveThreshold!)
      .gt("tvelo_metrics.current_stock", 0);
  } else if (dashFilter === "lost_revenue") {
    productsQuery = productsQuery
      .gt("tvelo_metrics.stockout_days", 0)
      .gt("tvelo_metrics.adjusted_velocity", 0);
  } else if (dashFilter === "dead_inventory") {
    productsQuery = productsQuery.gt("tvelo_metrics.coverage_days", effectiveThreshold!);
  } else if (dashFilter === "oos") {
    productsQuery = productsQuery
      .eq("tvelo_metrics.current_stock", 0)
      .gt("tvelo_metrics.adjusted_velocity", 0);
  } else if (dashFilter === "inactive") {
    productsQuery = productsQuery
      .eq("tvelo_metrics.current_stock", 0)
      .eq("tvelo_metrics.adjusted_velocity", 0);
  } else if (dashFilter === "active") {
    // Новый dashFilter (Александр 01.06.2026): активные SKU.
    // Условие = stock > 0 OR velocity > 0 (зеркало inactive).
    productsQuery = productsQuery.or(
      "current_stock.gt.0,adjusted_velocity.gt.0",
      { foreignTable: "tvelo_metrics" },
    );
  } else if (dashFilter === "frequently_oos") {
    productsQuery = productsQuery.gt("tvelo_metrics.stockout_days", effectiveThreshold!);
  } else if (dashFilter === "inventory_concentration" || dashFilter === "demand_concentration") {
    const ids = concentrationIds ?? [];
    if (ids.length === 0) {
      productsQuery = productsQuery.in("product_id", ["00000000-0000-0000-0000-000000000000"]);
    } else {
      productsQuery = productsQuery.in("product_id", ids);
    }
  } else if (!includeInactive) {
    productsQuery = productsQuery.or("current_stock.gt.0,adjusted_velocity.gt.0", { foreignTable: "tvelo_metrics" });
  }

  if (segmentFilter) {
    productsQuery = productsQuery.eq("tvelo_metrics.inventory_segment", segmentFilter);
  }

  if (search) {
    const escaped = search.replace(/[%_]/g, (c) => "\\" + c);
    productsQuery = productsQuery.or(`sku.ilike.%${escaped}%,product_name.ilike.%${escaped}%`);
  }
  if (brandFilter) productsQuery = productsQuery.eq("brand", brandFilter);
  if (categoryFilter) productsQuery = productsQuery.eq("category", categoryFilter);
  if (tagFilter) productsQuery = productsQuery.contains("tags", [tagFilter]);
  if (stockMin !== null) productsQuery = productsQuery.gte("tvelo_metrics.current_stock", stockMin);
  if (stockMax !== null) productsQuery = productsQuery.lte("tvelo_metrics.current_stock", stockMax);
  if (oosMin !== null)   productsQuery = productsQuery.gte("tvelo_metrics.stockout_days", oosMin);
  if (oosMax !== null)   productsQuery = productsQuery.lte("tvelo_metrics.stockout_days", oosMax);
  if (coverageMin !== null) productsQuery = productsQuery.gte("tvelo_metrics.coverage_days", coverageMin);
  if (coverageMax !== null) productsQuery = productsQuery.lte("tvelo_metrics.coverage_days", coverageMax);
  // date_from/date_to намеренно НЕ фильтруют tvelo_metrics.period_end:
  // период пользователя пересчитывается на лету ниже (get_skus_period_metrics),
  // а фильтр по period_end лишь прятал строки, ничего не пересчитывая.

  const lostFilterActiveButPostProcess =
    (lostMin !== null && lostMin > 0) || lostMax !== null;

  const { data: products, count } = await productsQuery
    .order("sku").range(from, to);

  const productIds = (products ?? []).map((p: any) => p.product_id);
  const sparkData: Record<string, number[]> = {};
  if (productIds.length > 0) {
    const { data: history } = await supabase
      .from("tvelo_metrics")
      .select("product_id,adjusted_velocity,period_end")
      .in("product_id", productIds)
      .order("period_end", { ascending: true });
    for (const h of history ?? []) {
      const arr = sparkData[(h as any).product_id] ?? [];
      arr.push(Number(h.adjusted_velocity));
      sparkData[(h as any).product_id] = arr.slice(-7);
    }
  }

  let filtered = (products ?? []).map((p: any) => {
    const metrics = (p.tvelo_metrics as any[] | undefined) ?? [];
    const matchedMetric = metrics.find(m => {
      const len = Math.round((new Date(m.period_end).getTime() - new Date(m.period_start).getTime()) / 86400_000);
      return Math.abs(len - (periodDays - 1)) <= 1;
    }) ?? metrics[0];
    return { ...p, tvelo_metrics: matchedMetric ? [matchedMetric] : [] };
  });

  // Окно для пересчёта метрик на лету. Приоритет: явный период пользователя
  // из фильтров → предпраздничное окно → нет (сохранённые ночные метрики).
  const overrideWindow = customPeriod
    ? { start: periodStart, end: periodEnd }
    : preHoliday
      ? { start: preHoliday.windowStart, end: defaultDateTo }
      : null;

  let periodMetrics: Map<string, PeriodMetricsRow> | null = null;
  if (overrideWindow && filtered.length > 0) {
    const { data: rpcRows } = await supabase.rpc("get_skus_period_metrics", {
      p_seller_id: user.id,
      p_connection_id: selected?.id ?? null,
      p_period_start: overrideWindow.start,
      p_period_end: overrideWindow.end,
      p_product_ids: filtered.map((p: any) => p.product_id),
    });
    periodMetrics = new Map();
    for (const r of (rpcRows ?? []) as any[]) {
      periodMetrics.set(r.product_id, {
        product_id: r.product_id,
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

  const salesByProduct: Record<string, number> = {};
  if (!periodMetrics && filtered.length > 0) {
    const firstM = filtered[0].tvelo_metrics?.[0];
    if (firstM?.period_start && firstM?.period_end) {
      const { data: salesEvents } = await supabase
        .from("inventory_events")
        .select("product_id, delta_stock")
        .in("product_id", filtered.map((p: any) => p.product_id))
        .eq("event_type", "sales_like")
        .gte("event_date", firstM.period_start)
        .lte("event_date", firstM.period_end);

      for (const ev of (salesEvents ?? []) as any[]) {
        const pid = ev.product_id;
        const delta = Math.abs(Number(ev.delta_stock ?? 0));
        salesByProduct[pid] = (salesByProduct[pid] ?? 0) + delta;
      }
    }
  }

  const lostByProduct: Record<string, number> = {};
  const lostUnitsByProduct: Record<string, number> = {};
  for (const p of filtered) {
    const override = periodMetrics?.get(p.product_id);
    if (override) {
      lostByProduct[p.product_id] = override.lost_revenue;
      lostUnitsByProduct[p.product_id] = Math.round(override.velocity * override.stockout_days);
    } else {
      const m = p.tvelo_metrics?.[0];
      if (m) {
        const vel = Number(m.adjusted_velocity ?? 0);
        const sod = Number(m.stockout_days ?? 0);
        const pr = Number(m.current_price ?? 0);
        lostByProduct[p.product_id] = vel * sod * pr;
        lostUnitsByProduct[p.product_id] = Math.round(vel * sod);
      } else {
        lostByProduct[p.product_id] = 0;
        lostUnitsByProduct[p.product_id] = 0;
      }
    }
  }
  if (lostFilterActiveButPostProcess) {
    filtered = filtered.filter((p: any) => {
      const v = lostByProduct[p.product_id] ?? 0;
      if (lostMin !== null && v <= lostMin) return false;
      if (lostMax !== null && v > lostMax) return false;
      return true;
    });
  }

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const exportParams = new URLSearchParams();
  exportParams.set("period", String(periodDays));
  if (selected) exportParams.set("warehouse_id", selected.id);
  if (segmentFilter) exportParams.set("segment", segmentFilter);
  if (dashFilter) exportParams.set("filter", dashFilter);
  if (customThreshold !== null) exportParams.set("threshold", String(customThreshold));
  if (includeInactive && !dashFilter) exportParams.set("include_inactive", "1");
  if (search) exportParams.set("q", search);
  if (stockMin !== null) exportParams.set("stock_min", String(stockMin));
  if (stockMax !== null) exportParams.set("stock_max", String(stockMax));
  if (oosMin !== null) exportParams.set("oos_min", String(oosMin));
  if (oosMax !== null) exportParams.set("oos_max", String(oosMax));
  if (lostMin !== null) exportParams.set("lost_min", String(lostMin));
  if (lostMax !== null) exportParams.set("lost_max", String(lostMax));
  if (coverageMin !== null) exportParams.set("coverage_min", String(coverageMin));
  if (coverageMax !== null) exportParams.set("coverage_max", String(coverageMax));
  if (dateFrom) exportParams.set("date_from", dateFrom);
  if (dateTo) exportParams.set("date_to", dateTo);
  const exportQS = exportParams.toString();

  const activeFilterCount =
    (dashFilter ? 1 : 0) +
    (segmentFilter ? 1 : 0) +
    (search ? 1 : 0) +
    ((stockMin !== null || stockMax !== null) ? 1 : 0) +
    ((oosMin !== null || oosMax !== null) ? 1 : 0) +
    ((lostMin !== null || lostMax !== null) ? 1 : 0) +
    ((coverageMin !== null || coverageMax !== null) ? 1 : 0) +
    ((dateFrom || dateTo) ? 1 : 0) +
    ((brandFilter || categoryFilter || tagFilter) ? 1 : 0) +
    (includeInactive && !dashFilter ? 1 : 0);

  const buildQs = (overrides: Record<string, string | number | null> = {}) => {
    const current: Record<string, string> = {};

    if (page !== 1) current.page = String(page);
    if (segmentFilter) current.segment = segmentFilter;
    if (reorderDays !== 30) current.reorder_days = String(reorderDays);
    if (periodDays !== 30) current.period = String(periodDays);
    if (dashFilter) current.filter = dashFilter;
    if (customThreshold !== null) current.threshold = String(customThreshold);
    if (includeInactive && !dashFilter) current.include_inactive = "1";
    if (search) current.q = search;
    if (stockMin !== null) current.stock_min = String(stockMin);
    if (stockMax !== null) current.stock_max = String(stockMax);
    if (oosMin !== null) current.oos_min = String(oosMin);
    if (oosMax !== null) current.oos_max = String(oosMax);
    if (lostMin !== null) current.lost_min = String(lostMin);
    if (lostMax !== null) current.lost_max = String(lostMax);
    if (coverageMin !== null) current.coverage_min = String(coverageMin);
    if (coverageMax !== null) current.coverage_max = String(coverageMax);
    if (dateFrom) current.date_from = dateFrom;
    if (dateTo) current.date_to = dateTo;
    if (brandFilter) current.brand = brandFilter;
    if (categoryFilter) current.category = categoryFilter;
    if (tagFilter) current.tag = tagFilter;

    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) {
        delete current[k];
      } else if (v !== undefined) {
        current[k] = String(v);
      }
    }

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(current)) {
      params.set(k, v);
    }
    return params.toString();
  };

  // Заголовок «Дней без наличия (за N дн)»: при явном периоде — его длина.
  const displayPeriodDays = customPeriod
    ? Math.max(1, Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400_000) + 1)
    : preHoliday ? preHoliday.daysBefore : periodDays;

  return (
    <div className="space-y-6">
      {/* 04.06.2026 (Александр): GET-форма «Закупка на N дней» со стрелкой убрана из
          шапки: при сабмите она теряла date_from/date_to и все min/max-диапазоны
          (hidden-поля сохраняли не всё) — отсюда нули в закупке. Поле переехало в
          SkusFilters и применяется кнопкой «Рассчитать» вместе со всеми параметрами. */}
      <header className="flex items-end justify-between gap-3 sm:gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{t("sku.list.eyebrow")}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink">SKU</h1>
          {selected && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-sm text-ink-muted">
              <span className="size-1.5 rounded-full bg-lime-deep shrink-0" />
              <span className="font-medium text-ink truncate max-w-[200px] sm:max-w-none">{selected.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
                {warehouseKindLabel(selected.warehouse_kind)}
              </span>
            </div>
          )}
        </div>
      </header>

      {dashFilter && (
        <DashFilterChip
          filter={dashFilter}
          periodDays={periodDays}
          threshold={customThreshold}
          segmentFilter={segmentFilter}
        />
      )}

      {(brandFilter || categoryFilter) && (
        <div className="flex items-center gap-2 flex-wrap">
          {brandFilter && (
            <TagFilterChip kind="brand" value={brandFilter} removeHref={`/dashboard/skus?${buildQs({ brand: null, page: null })}`} />
          )}
          {categoryFilter && (
            <TagFilterChip kind="category" value={categoryFilter} removeHref={`/dashboard/skus?${buildQs({ category: null, page: null })}`} />
          )}
        </div>
      )}

      <SkusFilters
        warehouseCreatedAt={warehouseCreatedAt}
        ranges={filterRanges}
        includeInactive={includeInactive}
        showInactiveToggle={!dashFilter}
        defaultDateFrom={defaultDateFrom}
        defaultDateTo={defaultDateTo}
        preHolidayLabel={preHolidayLabel}
      />

      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <SearchInput />
        <div className="inline-flex gap-1 rounded-lg border border-line bg-paper p-1 overflow-x-auto max-w-full">
          {SEGMENTS.map(s => {
            const params = new URLSearchParams();
            if (s.value) params.set("segment", s.value);
            if (reorderDays !== 30) params.set("reorder_days", String(reorderDays));
            if (periodDays !== 30) params.set("period", String(periodDays));
            if (dashFilter) params.set("filter", dashFilter);
            if (customThreshold !== null) params.set("threshold", String(customThreshold));
            if (includeInactive && !dashFilter) params.set("include_inactive", "1");
            if (search) params.set("q", search);
            const qs = params.toString();
            const isActive = segmentFilter === s.value;
            return (
              <Link
                key={s.value}
                href={`/dashboard/skus${qs ? `?${qs}` : ""}` as any}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition whitespace-nowrap shrink-0 ${
                  isActive ? "bg-ink text-paper" : "text-ink-muted hover:text-ink hover:bg-bg-soft"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <ColumnsPicker />
          <div className={`inline-flex gap-1 rounded-lg border bg-paper p-1 ${
            activeFilterCount > 0 ? "border-lime-deep/40" : "border-line"
          }`}>
            <a
              href={`/api/export/metrics?${exportQS}&format=excel`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-bg-soft transition min-h-[32px]"
              title={activeFilterCount > 0 ? t("sku.list.exportExcelFiltered", { n: activeFilterCount }) : t("sku.list.exportExcel")}
            >
              <Icons.ArrowRight size={11} /> Excel
            </a>
            <a
              href={`/api/export/metrics?${exportQS}&format=csv`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-bg-soft transition border-l border-line min-h-[32px]"
              title={activeFilterCount > 0 ? t("sku.list.exportCsvFiltered", { n: activeFilterCount }) : t("sku.list.exportCsv")}
            >
              CSV
            </a>
          </div>
        </div>
      </div>

      {!selected && (
        <div className="rounded-xl border border-orange/30 bg-orange/5 p-4 flex items-start gap-3">
          <span className="text-orange mt-0.5 shrink-0">⛔️</span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">{t("sku.list.noWarehouse.title")}</div>
            <p className="mt-1 text-ink-muted">
              <Link href={"/connections/new" as any} className="text-lime-deep underline hover:no-underline">
                {t("sku.list.noWarehouse.link")}
              </Link>{" "}
              {t("sku.list.noWarehouse.tail")}
            </p>
          </div>
        </div>
      )}

      <SkusTable
        rows={filtered}
        selectedName={selected?.name ?? null}
        sparkData={sparkData}
        salesByProduct={salesByProduct}
        lostByProduct={lostByProduct}
        lostUnitsByProduct={lostUnitsByProduct}
        periodMetrics={periodMetrics}
        reorderDays={reorderDays}
        displayPeriodDays={displayPeriodDays}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm flex-wrap gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
            {t("sku.list.total")} <span className="text-ink-soft tabular">{count ?? 0}</span> {t("sku.list.pageLabel")} <span className="text-ink-soft tabular">{page}</span> {t("sku.list.of")} <span className="text-ink-soft tabular">{totalPages}</span>
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?${buildQs({ page: page - 1 })}` as any}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs min-h-[36px]">
                <span className="rotate-180"><Icons.ArrowRight size={11} /></span> {t("sku.list.prev")}
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?${buildQs({ page: page + 1 })}` as any}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs min-h-[36px]">
                {t("sku.list.next")} <Icons.ArrowRight size={11} />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TagFilterChip({ kind, value, removeHref }: {
  kind: "brand" | "category";
  value: string;
  removeHref: string;
}) {
  const label = kind === "brand" ? (isEn ? "Brand" : "Бренд") : (isEn ? "Category" : "Категория");
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-azure/40 bg-azure/5 pl-3 pr-1.5 py-1.5 text-sm">
      <span className="font-mono text-[10px] uppercase tracking-widest text-azure font-semibold">{label}</span>
      <span className="font-medium text-ink break-all">{value}</span>
      <Link
        href={removeHref as any}
        className="inline-flex items-center justify-center size-5 rounded text-ink-hush hover:text-ink hover:bg-bg-soft transition shrink-0"
        aria-label={isEn ? "Clear" : "Сбросить"}
      >
        <span aria-hidden className="text-base leading-none">×</span>
      </Link>
    </span>
  );
}
