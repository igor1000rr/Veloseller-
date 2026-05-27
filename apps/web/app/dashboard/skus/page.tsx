import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { VelocitySparkline } from "./VelocitySparkline";
import { Icons } from "../../_components/Icons";
import { InfoTooltip } from "../../_components/InfoTooltip";
import { getSelectedWarehouse, warehouseKindLabel } from "@/lib/warehouse";
import { SkusFilters, type FilterRanges } from "./SkusFilters";
import { SearchInput } from "./SearchInput";
import { NotesCell } from "./NotesCell";
import { DashFilterChip } from "./DashFilterChip";
import { ColumnsPicker } from "./ColumnsPicker";

const PAGE_SIZE = 50;

const SEGMENTS = [
  { value: "",                    label: "Все" },
  { value: "fast_movers",         label: "Быстрые" },
  { value: "stable",              label: "Стабильные" },
  { value: "slow_movers",         label: "Медленные" },
  { value: "dead_inventory_risk", label: "Неликвид" },
];

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
  "low_stock",
  "lost_revenue",
  "dead_inventory",
  "oos",
  "inactive",
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
    date_from?: string;
    date_to?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const segmentFilter = sp.segment ?? "";
  const reorderDays = Math.max(1, parseInt(sp.reorder_days ?? "30", 10) || 30);
  const periodDays = (sp.period === "7" || sp.period === "90") ? parseInt(sp.period) : 30;
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
  const dateFrom = parseDateOrNull(sp.date_from);
  const dateTo = parseDateOrNull(sp.date_to);

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
      product_id, sku, product_name, user_notes,
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
    const escaped = search.replace(/[%_]/g, "\\$&");
    productsQuery = productsQuery.or(`sku.ilike.%${escaped}%,product_name.ilike.%${escaped}%`);
  }
  if (stockMin !== null) productsQuery = productsQuery.gte("tvelo_metrics.current_stock", stockMin);
  if (stockMax !== null) productsQuery = productsQuery.lte("tvelo_metrics.current_stock", stockMax);
  if (oosMin !== null)   productsQuery = productsQuery.gte("tvelo_metrics.stockout_days", oosMin);
  if (oosMax !== null)   productsQuery = productsQuery.lte("tvelo_metrics.stockout_days", oosMax);
  if (dateFrom)          productsQuery = productsQuery.gte("tvelo_metrics.period_end", dateFrom);
  if (dateTo)            productsQuery = productsQuery.lte("tvelo_metrics.period_end", dateTo);

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

  // Реальные продажи за период — sum sales_like deltas (Александр 27.05.2026).
  const salesByProduct: Record<string, number> = {};
  if (filtered.length > 0) {
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
  for (const p of filtered) {
    const m = p.tvelo_metrics?.[0];
    const lost = m
      ? Number(m.adjusted_velocity ?? 0) * Number(m.stockout_days ?? 0) * Number(m.current_price ?? 0)
      : 0;
    lostByProduct[p.product_id] = lost;
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
    ((dateFrom || dateTo) ? 1 : 0) +
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
    if (dateFrom) current.date_from = dateFrom;
    if (dateTo) current.date_to = dateTo;

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

  return (
    <div className="space-y-6">
      {/* Header: только title + название склада + «Закупка на N дней» форма справа */}
      <header className="flex items-end justify-between gap-3 sm:gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Inventory</span>
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
        <form className="flex items-center gap-2 text-sm">
          <label className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Закупка на</label>
          <input
            type="number" name="reorder_days" defaultValue={reorderDays} min={1} max={365}
            inputMode="numeric"
            className="w-16 sm:w-20 px-2 py-1.5 border border-line rounded-lg text-center bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">дней</span>
          {segmentFilter && <input type="hidden" name="segment" value={segmentFilter} />}
          {dashFilter && <input type="hidden" name="filter" value={dashFilter} />}
          {customThreshold !== null && <input type="hidden" name="threshold" value={customThreshold} />}
          {periodDays !== 30 && <input type="hidden" name="period" value={periodDays} />}
          {search && <input type="hidden" name="q" value={search} />}
          <button type="submit" className="px-3 py-1.5 text-xs bg-ink text-paper rounded-lg hover:bg-ink-soft transition min-h-[36px]">→</button>
        </form>
      </header>

      {dashFilter && (
        <DashFilterChip
          filter={dashFilter}
          periodDays={periodDays}
          threshold={customThreshold}
          segmentFilter={segmentFilter}
        />
      )}

      {/* Серая плашка фильтров: Период + чекбокс + 3 ranges */}
      <SkusFilters
        warehouseCreatedAt={warehouseCreatedAt}
        ranges={filterRanges}
        includeInactive={includeInactive}
        showInactiveToggle={!dashFilter}
      />

      {/* Строка под фильтрами: поиск + сегменты + ColumnsPicker + Excel/CSV (paint-скрин 27.05.2026) */}
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
              title={activeFilterCount > 0 ? `Скачать метрики в Excel (с фильтрами: ${activeFilterCount})` : "Скачать метрики в Excel"}
            >
              <Icons.ArrowRight size={11} /> Excel
            </a>
            <a
              href={`/api/export/metrics?${exportQS}&format=csv`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-bg-soft transition border-l border-line min-h-[32px]"
              title={activeFilterCount > 0 ? `Скачать метрики в CSV (с фильтрами: ${activeFilterCount})` : "Скачать метрики в CSV"}
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
            <div className="font-medium text-ink">Ни одного склада не подключено</div>
            <p className="mt-1 text-ink-muted">
              <Link href={"/connections/new" as any} className="text-lime-deep underline hover:no-underline">
                Подключите первый склад
              </Link>{" "}
              чтобы начать собирать данные по SKU.
            </p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
        <table className="min-w-full text-sm">
          <thead className="bg-bg-soft border-b border-line">
            <tr>
              <Th col="sku">SKU</Th>
              <Th col="name">Название</Th>
              <Th col="stock" align="right">Остаток</Th>
              <Th col="price" align="right">Цена</Th>
              <Th col="tvelo" align="right">TVelo</Th>
              <Th col="median" align="right">Медиана</Th>
              <Th col="trend" align="center">Тренд</Th>
              <Th col="coverage" align="right">Покрытие</Th>
              <Th col="oos" align="right">OOS ({periodDays}д)</Th>
              <Th col="sales" align="right">
                <span className="inline-flex items-center">
                  Продажи
                  <InfoTooltip text="Фактические продажи за период — сумма дельт снижения остатка (sales_like события). Может НЕ равняться TVelo × дни в наличии: TVelo добавляет оценочные продажи за дни пополнений и аномалий чтобы не занижать скорость." />
                </span>
              </Th>
              <Th col="reorder" align="right">Закупка ({reorderDays}д)</Th>
              <Th col="confidence" align="right" accent>
                <span className="inline-flex items-center">
                  ДСТ
                  <InfoTooltip text="Достоверность данных за указанный период. Чем больше дней для расчёта, тем выше качество предоставляемой информации. Учитывайте этот показатель для совершения действий." />
                </span>
              </Th>
              <Th col="health" align="right">Health</Th>
              <Th col="lost_revenue" align="right">
                <span className="inline-flex items-center">
                  Потерянная выручка
                  <InfoTooltip text="Потерянная выручка из-за отсутствия товара на складе. Формула: velocity × дни OOS × цена." />
                </span>
              </Th>
              <Th col="notes">Заметки</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((p: any) => {
              const m = (p.tvelo_metrics?.[0] ?? null) as any;
              const adjVel = m?.adjusted_velocity != null ? Number(m.adjusted_velocity) : 0;
              const medVel = m?.median_30d_velocity != null ? Number(m.median_30d_velocity) : 0;
              const stockoutDays = m?.stockout_days != null ? Number(m.stockout_days) : 0;
              const salesUnits = salesByProduct[p.product_id] ?? 0;
              const lostRev = lostByProduct[p.product_id] ?? 0;
              const reorderQty = Math.round(adjVel * reorderDays);
              const isUnderestimated = m?.underestimated_sku;

              return (
                <tr key={p.product_id} className="hover:bg-bg-soft/50 transition">
                  <td className="col-skucol-sku px-3 sm:px-4 py-3 font-mono text-xs">
                    <Link href={`/dashboard/skus/${p.product_id}` as any} className="text-lime-deep hover:text-ink font-medium transition">
                      {p.sku}
                    </Link>
                  </td>
                  <td className="col-skucol-name px-3 sm:px-4 py-3">
                    <div className="text-ink-soft">{p.product_name}</div>
                    {isUnderestimated && (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-azure font-semibold">недооценён</span>
                    )}
                  </td>
                  <td className="col-skucol-stock px-3 sm:px-4 py-3 text-right tabular text-ink-soft">{m?.current_stock ?? "—"}</td>
                  <td className="col-skucol-price px-3 sm:px-4 py-3 text-right tabular text-ink-soft">{m?.current_price ?? "—"}</td>
                  <td className="col-skucol-tvelo px-3 sm:px-4 py-3 text-right font-semibold tabular text-ink">
                    {adjVel > 0 ? adjVel.toFixed(2) : "—"}
                  </td>
                  <td className="col-skucol-median px-3 sm:px-4 py-3 text-right tabular text-ink-hush" title="Медиана из 30-day pre-period — используется для continuity correction">
                    {medVel > 0 ? medVel.toFixed(2) : "—"}
                  </td>
                  <td className="col-skucol-trend px-3 sm:px-4 py-3"><VelocitySparkline points={sparkData[p.product_id] ?? []} /></td>
                  <td className="col-skucol-coverage px-3 sm:px-4 py-3 text-right tabular text-ink-soft">
                    {m?.coverage_days != null ? `${Number(m.coverage_days).toFixed(0)} д.` : "—"}
                  </td>
                  <td className="col-skucol-oos px-3 sm:px-4 py-3 text-right tabular" title="Дни out-of-stock за выбранный период">
                    {stockoutDays > 0 ? (
                      <span className="text-orange font-semibold">{stockoutDays}</span>
                    ) : (
                      <span className="text-ink-soft">0</span>
                    )}
                  </td>
                  <td className="col-skucol-sales px-3 sm:px-4 py-3 text-right tabular text-ink-soft" title="Фактические продажи за период (sum sales_like deltas)">
                    {salesUnits > 0 ? salesUnits : "—"}
                  </td>
                  <td className="col-skucol-reorder px-3 sm:px-4 py-3 text-right font-semibold tabular text-lime-deep">
                    {adjVel > 0 ? reorderQty : "—"}
                  </td>
                  <td className="col-skucol-confidence px-3 sm:px-4 py-3 text-right tabular bg-lime-soft/30">
                    {m?.confidence_score != null ? (
                      <span className="font-semibold text-ink">{Number(m.confidence_score).toFixed(0)}%</span>
                    ) : <span className="text-ink-hush">—</span>}
                  </td>
                  <td className="col-skucol-health px-3 sm:px-4 py-3 text-right">
                    <HealthBadge score={m?.sku_health_score} />
                  </td>
                  <td className="col-skucol-lost_revenue px-3 sm:px-4 py-3 text-right tabular">
                    {lostRev > 0 ? (
                      <span className="text-rose font-semibold whitespace-nowrap">
                        {Math.round(lostRev).toLocaleString("ru-RU")}
                      </span>
                    ) : (
                      <span className="text-ink-hush">—</span>
                    )}
                  </td>
                  <td className="col-skucol-notes px-3 sm:px-4 py-3">
                    <NotesCell productId={p.product_id} initial={p.user_notes ?? null} />
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={15} className="px-3 sm:px-4 py-12 text-center text-ink-muted text-sm">
                  {selected
                    ? `Пока нет данных по складу «${selected.name}». Дождитесь первой синхронизации или проверьте фильтры.`
                    : "Пока нет данных или ничего не подходит под фильтр."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm flex-wrap gap-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
            Всего: <span className="text-ink-soft tabular">{count ?? 0}</span> SKU · страница <span className="text-ink-soft tabular">{page}</span> из <span className="text-ink-soft tabular">{totalPages}</span>
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={`?${buildQs({ page: page - 1 })}` as any}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs min-h-[36px]">
                <span className="rotate-180"><Icons.ArrowRight size={11} /></span> Назад
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?${buildQs({ page: page + 1 })}` as any}
                    className="inline-flex items-center gap-1 px-3 py-2 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs min-h-[36px]">
                Вперёд <Icons.ArrowRight size={11} />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left", accent = false, col }: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  accent?: boolean;
  col: string;
}) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const accentCls = accent ? "bg-lime-soft/30" : "";
  return (
    <th className={`col-skucol-${col} px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold whitespace-nowrap ${alignCls} ${accentCls}`}>
      {children}
    </th>
  );
}

function HealthBadge({ score }: { score: number | null }) {
  if (score == null) return <span className="text-ink-hush">—</span>;
  const n = Number(score);
  if (n < 30) {
    return (
      <span className="inline-flex items-center justify-center font-semibold tabular text-rose bg-rose/10 border border-rose/30 rounded px-1.5 py-0.5 min-w-[2.5rem]">
        {n.toFixed(0)}
      </span>
    );
  }
  if (n < 70) {
    return (
      <span className="inline-flex items-center justify-center font-semibold tabular text-orange bg-orange/10 border border-orange/30 rounded px-1.5 py-0.5 min-w-[2.5rem]">
        {n.toFixed(0)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center font-semibold tabular text-lime-deep bg-lime-soft border border-lime-deep/30 rounded px-1.5 py-0.5 min-w-[2.5rem]">
      {n.toFixed(0)}
    </span>
  );
}
