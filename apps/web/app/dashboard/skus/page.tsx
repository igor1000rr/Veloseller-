import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { VelocitySparkline } from "./VelocitySparkline";
import { Icons } from "../../_components/Icons";
import { InfoTooltip } from "../../_components/InfoTooltip";
import { getSelectedWarehouse, warehouseKindLabel } from "@/lib/warehouse";
import { SkusFilters } from "./SkusFilters";
import { NotesCell } from "./NotesCell";

const PAGE_SIZE = 50;

const SEGMENTS = [
  { value: "",                    label: "Все" },
  { value: "fast_movers",         label: "Быстрые" },
  { value: "stable",              label: "Стабильные" },
  { value: "slow_movers",         label: "Медленные" },
  { value: "dead_inventory_risk", label: "Неликвид" },
];

type DashboardFilter = "low_stock" | "lost_revenue" | "dead_inventory" | "oos" | "inactive";

const DASHBOARD_FILTER_LABELS: Record<DashboardFilter, string> = {
  low_stock:      "Низкий остаток · покрытие ≤ 7 дней",
  lost_revenue:   "Потерянная выручка · была недополучка из-за OOS",
  dead_inventory: "Неликвид · покрытие > 180 дней",
  oos:            "Нет в наличии · активные SKU (с движением за 30 дней)",
  inactive:       "SKU без активности · 0 остаток + нет движений",
};

function isDashboardFilter(s: string | undefined): s is DashboardFilter {
  return s === "low_stock" || s === "lost_revenue" || s === "dead_inventory"
      || s === "oos" || s === "inactive";
}

function parseIntOrNull(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// Парсинг даты в формате YYYY-MM-DD из query
function parseDateOrNull(s: string | undefined): string | null {
  if (s == null || s === "") return null;
  // Простая валидация YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export default async function SkusPage({ searchParams }: {
  searchParams: Promise<{
    page?: string;
    segment?: string;
    reorder_days?: string;
    period?: string;
    filter?: string;
    include_inactive?: string;
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
  // warehouseCreatedAt используется для min даты в календаре
  const warehouseCreatedAt = selected?.created_at ?? null;

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

  // dashFilter из обзора
  if (dashFilter === "low_stock") {
    productsQuery = productsQuery
      .lte("tvelo_metrics.coverage_days", 7)
      .gt("tvelo_metrics.current_stock", 0);
  } else if (dashFilter === "lost_revenue") {
    productsQuery = productsQuery
      .gt("tvelo_metrics.stockout_days", 0)
      .gt("tvelo_metrics.adjusted_velocity", 0);
  } else if (dashFilter === "dead_inventory") {
    productsQuery = productsQuery.gt("tvelo_metrics.coverage_days", 180);
  } else if (dashFilter === "oos") {
    productsQuery = productsQuery
      .eq("tvelo_metrics.current_stock", 0)
      .gt("tvelo_metrics.adjusted_velocity", 0);
  } else if (dashFilter === "inactive") {
    productsQuery = productsQuery
      .eq("tvelo_metrics.current_stock", 0)
      .eq("tvelo_metrics.adjusted_velocity", 0);
  } else if (!includeInactive) {
    productsQuery = productsQuery.or("current_stock.gt.0,adjusted_velocity.gt.0", { foreignTable: "tvelo_metrics" });
  }

  if (segmentFilter) {
    productsQuery = productsQuery.eq("tvelo_metrics.inventory_segment", segmentFilter);
  }

  // Фильтры панели
  if (search) {
    const escaped = search.replace(/[%_]/g, "\\$&");
    productsQuery = productsQuery.or(`sku.ilike.%${escaped}%,product_name.ilike.%${escaped}%`);
  }
  if (stockMin !== null) {
    productsQuery = productsQuery.gte("tvelo_metrics.current_stock", stockMin);
  }
  if (stockMax !== null) {
    productsQuery = productsQuery.lte("tvelo_metrics.current_stock", stockMax);
  }
  if (oosMin !== null) {
    productsQuery = productsQuery.gte("tvelo_metrics.stockout_days", oosMin);
  }
  if (oosMax !== null) {
    productsQuery = productsQuery.lte("tvelo_metrics.stockout_days", oosMax);
  }
  // Календарь date_from / date_to — фильтрует по period_end (дата последнего пересчёта)
  if (dateFrom) {
    productsQuery = productsQuery.gte("tvelo_metrics.period_end", dateFrom);
  }
  if (dateTo) {
    productsQuery = productsQuery.lte("tvelo_metrics.period_end", dateTo);
  }
  // lost_min / lost_max — формула не выразима через Supabase API, применяется
  // пост-фильтром в памяти после получения данных.
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
  const exportQS = exportParams.toString();

  const buildQs = (overrides: Record<string, string | number | null>) => {
    const params = new URLSearchParams();
    if (page !== 1 && overrides.page !== null) params.set("page", String(overrides.page ?? page));
    if (segmentFilter && overrides.segment !== null) params.set("segment", String(overrides.segment ?? segmentFilter));
    if (reorderDays !== 30) params.set("reorder_days", String(reorderDays));
    if (periodDays !== 30) params.set("period", String(periodDays));
    if (dashFilter && overrides.filter !== null) params.set("filter", overrides.filter ?? dashFilter);
    if (includeInactive && !dashFilter) params.set("include_inactive", "1");
    if (search) params.set("q", search);
    if (stockMin !== null) params.set("stock_min", String(stockMin));
    if (stockMax !== null) params.set("stock_max", String(stockMax));
    if (oosMin !== null) params.set("oos_min", String(oosMin));
    if (oosMax !== null) params.set("oos_max", String(oosMax));
    if (lostMin !== null) params.set("lost_min", String(lostMin));
    if (lostMax !== null) params.set("lost_max", String(lostMax));
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) params.delete(k);
      else if (v !== undefined && k !== "page" && k !== "segment" && k !== "filter") params.set(k, String(v));
    }
    return params.toString();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Inventory</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">SKU</h1>
          {selected && (
            <div className="mt-1.5 flex items-center gap-2 flex-wrap text-sm text-ink-muted">
              <span className="size-1.5 rounded-full bg-lime-deep" />
              <span className="font-medium text-ink">{selected.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
                {warehouseKindLabel(selected.warehouse_kind)}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex gap-1 rounded-lg border border-line bg-paper p-1">
            <a
              href={`/api/export/metrics?${exportQS}&format=excel`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-bg-soft transition"
              title="Скачать метрики в Excel (CSV с BOM, разделитель ;)"
            >
              <Icons.ArrowRight size={11} /> Excel
            </a>
            <a
              href={`/api/export/metrics?${exportQS}&format=csv`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-bg-soft transition border-l border-line"
              title="Скачать метрики в CSV"
            >
              CSV
            </a>
          </div>
          <form className="flex items-center gap-2 text-sm">
            <label className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Закупка на</label>
            <input
              type="number" name="reorder_days" defaultValue={reorderDays} min={1} max={365}
              className="w-20 px-2 py-1.5 border border-line rounded-lg text-center bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep"
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">дней</span>
            {segmentFilter && <input type="hidden" name="segment" value={segmentFilter} />}
            {dashFilter && <input type="hidden" name="filter" value={dashFilter} />}
            {periodDays !== 30 && <input type="hidden" name="period" value={periodDays} />}
            {search && <input type="hidden" name="q" value={search} />}
            <button type="submit" className="px-2.5 py-1.5 text-xs bg-ink text-paper rounded-lg hover:bg-ink-soft transition">→</button>
          </form>
          <div className="inline-flex gap-1 rounded-lg border border-line bg-paper p-1">
            {SEGMENTS.map(s => {
              const params = new URLSearchParams();
              if (s.value) params.set("segment", s.value);
              if (reorderDays !== 30) params.set("reorder_days", String(reorderDays));
              if (periodDays !== 30) params.set("period", String(periodDays));
              if (dashFilter) params.set("filter", dashFilter);
              if (includeInactive && !dashFilter) params.set("include_inactive", "1");
              if (search) params.set("q", search);
              const qs = params.toString();
              const isActive = segmentFilter === s.value;
              return (
                <Link
                  key={s.value}
                  href={`/dashboard/skus${qs ? `?${qs}` : ""}` as any}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                    isActive ? "bg-ink text-paper" : "text-ink-muted hover:text-ink hover:bg-bg-soft"
                  }`}
                >
                  {s.label}
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {dashFilter && (
        <div className="flex items-center gap-3 rounded-xl border border-lime-deep/30 bg-lime-soft p-3 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold shrink-0">
            фильтр с обзора
          </span>
          <span className="text-sm text-ink font-medium">
            {DASHBOARD_FILTER_LABELS[dashFilter]}
          </span>
          <span className="ml-auto inline-flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
              период {periodDays} дней
            </span>
            <Link
              href={`/dashboard/skus${segmentFilter ? `?segment=${segmentFilter}` : ""}` as any}
              className="text-xs font-medium text-ink-muted hover:text-ink underline underline-offset-2 transition"
            >
              сбросить
            </Link>
          </span>
        </div>
      )}

      {!dashFilter && (
        <div className="flex items-center gap-2 text-sm text-ink-muted">
          <Link
            href={`/dashboard/skus${buildQs({
              include_inactive: includeInactive ? null : "1",
              page: null,
            }) ? `?${buildQs({ include_inactive: includeInactive ? null : "1", page: null })}` : ""}` as any}
            className="inline-flex items-center gap-2 cursor-pointer hover:text-ink transition"
          >
            <span className={`size-4 rounded border ${includeInactive ? "bg-ink border-ink" : "bg-paper border-line"} flex items-center justify-center transition`}>
              {includeInactive && <span className="text-paper text-[10px]">✓</span>}
            </span>
            Включить SKU без активности
          </Link>
          <InfoTooltip text="Товары с нулевым остатком и без движений за последние 30 дней. По умолчанию скрыты — их не нужно учитывать в большинстве сценариев." />
        </div>
      )}

      {/* Панель фильтров (client) — передаём warehouseCreatedAt для min календаря */}
      <SkusFilters warehouseCreatedAt={warehouseCreatedAt} />

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
              <Th>SKU</Th>
              <Th>Название</Th>
              <Th align="right">Остаток</Th>
              <Th align="right">Цена</Th>
              <Th align="right">TVelo</Th>
              <Th align="right">Медиана</Th>
              <Th align="center">Тренд</Th>
              <Th align="right">Покрытие</Th>
              <Th align="right">OOS ({periodDays}д)</Th>
              <Th align="right">Продажи</Th>
              <Th align="right">Закупка ({reorderDays}д)</Th>
              <Th align="right" accent>
                <span className="inline-flex items-center">
                  ДСТ
                  <InfoTooltip text="Достоверность данных за указанный период. Чем больше дней для расчёта, тем выше качество предоставляемой информации. Учитывайте этот показатель при принятии решений." />
                </span>
              </Th>
              <Th align="right">Health</Th>
              <Th align="right">Потерянная&nbsp;выручка</Th>
              <Th>Заметки</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filtered.map((p: any) => {
              const m = (p.tvelo_metrics?.[0] ?? null) as any;
              const adjVel = m?.adjusted_velocity != null ? Number(m.adjusted_velocity) : 0;
              const medVel = m?.median_30d_velocity != null ? Number(m.median_30d_velocity) : 0;
              const stockoutDays = m?.stockout_days != null ? Number(m.stockout_days) : 0;
              const inStockDays = m?.in_stock_days != null ? Number(m.in_stock_days) : 0;
              const salesUnits = Math.round(adjVel * inStockDays);
              const lostRev = lostByProduct[p.product_id] ?? 0;
              const reorderQty = Math.round(adjVel * reorderDays);
              const isUnderestimated = m?.underestimated_sku;

              return (
                <tr key={p.product_id} className="hover:bg-bg-soft/50 transition">
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/dashboard/skus/${p.product_id}` as any} className="text-lime-deep hover:text-ink font-medium transition">
                      {p.sku}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-ink-soft">{p.product_name}</div>
                    {isUnderestimated && (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-azure font-semibold">недооценён</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">{m?.current_stock ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">{m?.current_price ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular text-ink">
                    {adjVel > 0 ? adjVel.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink-hush" title="Медиана из 30-day pre-period — используется для continuity correction">
                    {medVel > 0 ? medVel.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3"><VelocitySparkline points={sparkData[p.product_id] ?? []} /></td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft">
                    {m?.coverage_days != null ? `${Number(m.coverage_days).toFixed(0)} д.` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular" title="Дни out-of-stock за выбранный период">
                    {stockoutDays > 0 ? (
                      <span className="text-orange font-semibold">{stockoutDays}</span>
                    ) : (
                      <span className="text-ink-soft">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink-soft" title="Число единиц, которые мы записали в продажи за период">
                    {salesUnits > 0 ? salesUnits : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular text-lime-deep">
                    {adjVel > 0 ? reorderQty : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular bg-lime-soft/30">
                    {m?.confidence_score != null ? (
                      <span className="font-semibold text-ink">{Number(m.confidence_score).toFixed(0)}%</span>
                    ) : <span className="text-ink-hush">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <HealthBadge score={m?.sku_health_score} />
                  </td>
                  <td className="px-4 py-3 text-right tabular">
                    {lostRev > 0 ? (
                      <span className="text-rose font-semibold">
                        {Math.round(lostRev).toLocaleString("ru-RU")}
                      </span>
                    ) : (
                      <span className="text-ink-hush">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <NotesCell productId={p.product_id} initial={p.user_notes ?? null} />
                  </td>
                </tr>
              );
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={15} className="px-4 py-12 text-center text-ink-muted text-sm">
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
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs">
                <span className="rotate-180"><Icons.ArrowRight size={11} /></span> Назад
              </Link>
            )}
            {page < totalPages && (
              <Link href={`?${buildQs({ page: page + 1 })}` as any}
                    className="inline-flex items-center gap-1 px-3 py-1.5 border border-line rounded-lg text-ink-muted hover:text-ink hover:bg-bg-soft transition text-xs">
                Вперёд <Icons.ArrowRight size={11} />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children, align = "left", accent = false }: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
  accent?: boolean;
}) {
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const accentCls = accent ? "bg-lime-soft/30" : "";
  return (
    <th className={`px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold ${alignCls} ${accentCls}`}>
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
