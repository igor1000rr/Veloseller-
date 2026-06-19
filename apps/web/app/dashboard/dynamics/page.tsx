import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../_components/Icons";
import { InfoTooltip } from "../../_components/InfoTooltip";
import DynamicsSearch from "./DynamicsSearch";
import { getSelectedWarehouse, listWarehouses, warehouseKindLabel } from "@/lib/warehouse";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TveloRow = {
  product_id: string;
  period_start: string;
  period_end: string;
  adjusted_velocity: number;
  products: { sku: string; product_name: string } | { sku: string; product_name: string }[] | null;
};

type SkuTrend = {
  pid: string;
  sku: string;
  name: string;
  current: number;
  previous: number;
  deltaPct: number;
  history: number[];
};

// Период агрегации (правка 12 Александра)
type Period = "day" | "week" | "month";
const PERIODS: { value: Period; label: string; pointsLimit: number; hint: string; lookbackDays: number }[] = [
  { value: "day",   label: t("dynamics.period.day"),   pointsLimit: 14, hint: t("dynamics.period.dayHint"),   lookbackDays: 30 },
  { value: "week",  label: t("dynamics.period.week"), pointsLimit: 12, hint: t("dynamics.period.weekHint"), lookbackDays: 100 },
  { value: "month", label: t("dynamics.period.month"),  pointsLimit: 6,  hint: t("dynamics.period.monthHint"), lookbackDays: 210 },
];

function isPeriod(s: string | undefined): s is Period {
  return s === "day" || s === "week" || s === "month";
}

/**
 * Бакетинг точки tvelo_metrics.period_end в ключ агрегации:
 * day → YYYY-MM-DD, week → YYYY-Www, month → YYYY-MM
 */
function bucketize(period_end: string, period: Period): string {
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
}

export default async function DynamicsPage({ searchParams }: {
  searchParams: Promise<{ q?: string; period?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim().toLowerCase();
  const period: Period = isPeriod(sp.period) ? sp.period : "day";
  const periodMeta = PERIODS.find(p => p.value === period)!;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // КРИТИЧНО: фильтр по выбранному складу — иначе данные FBO+FBS смешиваются.
  const [selected, allWarehouses] = await Promise.all([
    getSelectedWarehouse(supabase, user.id),
    listWarehouses(supabase, user.id),
  ]);

  // Empty state — нет складов вообще.
  if (allWarehouses.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-8 md:p-10 text-center">
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">{t("dynamics.empty.title")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted leading-relaxed">{t("dynamics.empty.text")}</p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <Link href={"/connections/new" as any} className="inline-flex items-center rounded-lg bg-ink text-paper px-5 py-3 font-semibold hover:bg-ink-soft transition">{t("dynamics.empty.btn")}</Link>
        </div>
      </div>
    );
  }

  const currentWarehouseId = selected?.id ?? allWarehouses[0].id;
  const currentWarehouseName = selected?.name ?? allWarehouses[0].name;
  const currentWarehouseKind = selected?.warehouse_kind ?? allWarehouses[0].warehouse_kind;
  const showMultiWarehouseBanner = allWarehouses.length > 1;

  // Ограничиваем выборку датой — для day берём ~30 дней, для week ~100, для month ~210.
  // Это убирает 90% строк (вся история не нужна) и даёт ~10× ускорение vs предыдущий fetchAll.
  const lookbackIso = new Date(Date.now() - periodMeta.lookbackDays * 86400_000)
    .toISOString().slice(0, 10);

  // Один запрос с фильтром по складу + по дате. БЕЗ пагинации — после фильтра данных немного.
  const { data: rowsData, error: rowsErr } = await supabase
    .from("tvelo_metrics")
    .select("product_id,period_end,adjusted_velocity,products!inner(sku,product_name,seller_id,connection_id)")
    .eq("products.seller_id", user.id)
    .eq("products.connection_id", currentWarehouseId)
    .gte("period_end", lookbackIso)
    .order("period_end", { ascending: true });

  const rows = (rowsData ?? []) as TveloRow[];
  if (rowsErr) {
    console.error("dynamics: query failed", rowsErr);
  }

  // Группировка по SKU. Сразу бакетизируем при вставке — экономит O(N×M) операций.
  type ProductData = {
    sku: string;
    name: string;
    byBucket: Map<string, number[]>;
  };
  const byProduct = new Map<string, ProductData>();
  const allBuckets = new Set<string>();

  for (const r of rows) {
    const product = Array.isArray(r.products) ? r.products[0] : r.products;
    if (!product) continue;
    const bucket = bucketize(r.period_end, period);
    allBuckets.add(bucket);

    let entry = byProduct.get(r.product_id);
    if (!entry) {
      entry = { sku: product.sku, name: product.product_name, byBucket: new Map() };
      byProduct.set(r.product_id, entry);
    }
    const vels = entry.byBucket.get(bucket);
    if (vels) vels.push(Number(r.adjusted_velocity));
    else entry.byBucket.set(bucket, [Number(r.adjusted_velocity)]);
  }

  const sortedBuckets = Array.from(allBuckets).sort();
  const recentBuckets = sortedBuckets.slice(-periodMeta.pointsLimit);

  // Для каждого SKU: avg velocity по каждому recent bucket.
  // Один проход — без вложенного fold по entries.
  const trends: SkuTrend[] = [];
  for (const [pid, data] of byProduct) {
    const cells: number[] = [];
    let activeCells = 0;
    for (const key of recentBuckets) {
      const vels = data.byBucket.get(key);
      const avg = vels && vels.length > 0
        ? vels.reduce((a, b) => a + b, 0) / vels.length
        : 0;
      cells.push(avg);
      if (avg > 0) activeCells += 1;
    }
    // Скрываем SKU без активности (правка 12 Александра)
    if (activeCells === 0) continue;
    if (cells.length < 2) continue;

    const current = cells[cells.length - 1];
    const previous = cells[cells.length - 2];
    if (previous === 0) continue;

    const deltaPct = ((current - previous) / previous) * 100;
    trends.push({ pid, sku: data.sku, name: data.name, current, previous, deltaPct, history: cells });
  }

  const surging = [...trends]
    .filter(t => t.current >= 0.1 && t.deltaPct > 10)
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 10);

  const sliding = [...trends]
    .filter(t => t.previous >= 0.1 && t.deltaPct < -10)
    .sort((a, b) => a.deltaPct - b.deltaPct)
    .slice(0, 10);

  const all = [...trends]
    .filter(t => !search || t.sku.toLowerCase().includes(search) || t.name.toLowerCase().includes(search))
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  const allLimited = all.slice(0, 50);

  // Тренд магазина — avg velocity по всем SKU за каждый bucket.
  // Тоже один проход вместо вложенного цикла.
  const storeTrend: { period: string; avg: number }[] = [];
  for (const key of recentBuckets) {
    const skuAvgs: number[] = [];
    for (const [, data] of byProduct) {
      const vels = data.byBucket.get(key);
      if (vels && vels.length > 0) {
        skuAvgs.push(vels.reduce((a, b) => a + b, 0) / vels.length);
      }
    }
    if (skuAvgs.length > 0) {
      storeTrend.push({ period: key, avg: skuAvgs.reduce((a, b) => a + b, 0) / skuAvgs.length });
    }
  }

  const noData = trends.length === 0;

  // Query-helper для смены периода с сохранением остальных параметров
  const periodLink = (p: Period) => {
    const params = new URLSearchParams();
    if (p !== "day") params.set("period", p);
    if (search) params.set("q", search);
    return `/dashboard/dynamics${params.toString() ? `?${params.toString()}` : ""}` as any;
  };

  const exportQs = new URLSearchParams();
  exportQs.set("period", period);
  if (currentWarehouseId) exportQs.set("warehouse_id", currentWarehouseId);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{t("dynamics.eyebrow")}</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">{t("dynamics.title")}</h1>
          <p className="text-sm text-ink-muted mt-1">{t("dynamics.subtitle")}</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap text-sm text-ink-muted">
            <span className="size-1.5 rounded-full bg-lime-deep shrink-0" />
            <span className="font-medium text-ink truncate max-w-[200px] sm:max-w-none">{currentWarehouseName}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
              {warehouseKindLabel(currentWarehouseKind)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Фильтр периода День/Неделя/Месяц (правка 12) */}
          <div className="inline-flex gap-1 rounded-lg border border-line bg-paper p-1">
            {PERIODS.map(p => {
              const isActive = period === p.value;
              return (
                <Link
                  key={p.value}
                  href={periodLink(p.value)}
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition ${
                    isActive ? "bg-ink text-paper" : "text-ink-muted hover:text-ink hover:bg-bg-soft"
                  }`}
                  title={p.hint}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
          {/* Excel / CSV экспорт в углу (правка 12) */}
          <div className="inline-flex gap-1 rounded-lg border border-line bg-paper p-1">
            <a
              href={`/api/export/dynamics?${exportQs.toString()}&format=excel`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-bg-soft transition"
              title={t("dynamics.exportExcel")}
            >
              <Icons.ArrowRight size={11} /> Excel
            </a>
            <a
              href={`/api/export/dynamics?${exportQs.toString()}&format=csv`}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-ink-muted hover:text-ink hover:bg-bg-soft transition border-l border-line"
              title={t("dynamics.exportCsv")}
            >
              CSV
            </a>
          </div>
        </div>
      </header>

      {showMultiWarehouseBanner && (
        <div className="rounded-xl border border-azure/30 bg-azure/5 p-4 flex items-start gap-3">
          <span className="text-azure mt-0.5 shrink-0"><InfoTooltip text="" /></span>
          <div className="flex-1 text-sm">
            <div className="font-medium text-ink">{t("dynamics.multiWh.title")}</div>
            <p className="mt-1 text-ink-muted">
              {t("dynamics.multiWh.pre")} <b>{currentWarehouseName}</b>{t("dynamics.multiWh.post")}
            </p>
          </div>
        </div>
      )}

      {noData ? (
        <div className="rounded-2xl border border-line bg-paper p-10 md:p-14 text-center">
          <div className="size-12 mx-auto rounded-full bg-lime-soft flex items-center justify-center text-lime-deep mb-4">
            <Icons.Health />
          </div>
          <p className="font-display text-xl text-ink font-medium">{t("dynamics.noData.title")}</p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
            {t("dynamics.noData.text", { hint: periodMeta.hint })}
          </p>
        </div>
      ) : (
        <>
          {/* Тренд магазина */}
          <div className="rounded-2xl border border-line bg-paper p-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
              {t("dynamics.storeAvg")} · {periodMeta.hint}
              <InfoTooltip text={t("dynamics.storeAvgTip")} />
            </h2>
            <div className="mt-3 flex items-end gap-3 flex-wrap">
              <div className="font-display text-3xl md:text-4xl tabular font-medium text-ink">
                {storeTrend.length > 0 ? storeTrend[storeTrend.length - 1].avg.toFixed(2) : "—"}
              </div>
              {storeTrend.length >= 2 && (() => {
                const last = storeTrend[storeTrend.length - 1].avg;
                const prev = storeTrend[storeTrend.length - 2].avg;
                if (prev === 0) return null;
                const d = ((last - prev) / prev) * 100;
                return <DeltaBadge value={d} />;
              })()}
              <span className="text-xs text-ink-muted font-mono">{t("dynamics.perDay")}</span>
            </div>
            <div className="mt-4">
              <Sparkline values={storeTrend.map(s => s.avg)} />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-ink-hush">
              <span>{storeTrend[0]?.period ?? ""}</span>
              <span>{storeTrend[storeTrend.length - 1]?.period ?? ""}</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TrendList
              title={t("dynamics.surge.title")}
              subtitle={t("dynamics.surge.subtitle")}
              tooltip={t("dynamics.surge.tip")}
              items={surging}
              tone="good"
              emptyText={t("dynamics.surge.empty")}
            />
            <TrendList
              title={t("dynamics.slide.title")}
              subtitle={t("dynamics.slide.subtitle")}
              tooltip={t("dynamics.slide.tip")}
              items={sliding}
              tone="bad"
              emptyText={t("dynamics.slide.empty")}
            />
          </div>

          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <div className="px-5 py-4 border-b border-line bg-bg-soft flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
                  {t("dynamics.all.title")}
                  <InfoTooltip text={t("dynamics.all.tip")} />
                </h2>
                <p className="text-xs text-ink-muted mt-1">
                  {t("dynamics.all.count", { total: all.length, shown: allLimited.length })}
                </p>
              </div>
              <DynamicsSearch initial={search} />
            </div>
            {allLimited.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-muted">
                {search ? t("dynamics.all.noMatch", { q: search }) : t("dynamics.all.noRows")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-line">
                    <tr>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("dynamics.col.sku")}</th>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("dynamics.col.name")}</th>
                      <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("dynamics.col.was")}</th>
                      <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("dynamics.col.became")}</th>
                      <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("dynamics.col.delta")}</th>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("dynamics.col.trend")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {allLimited.map(t => (
                      <tr key={t.pid} className="hover:bg-bg-soft/40 transition">
                        <td className="px-4 py-2.5">
                          <Link href={`/dashboard/skus/${t.pid}` as any} className="font-mono text-xs text-lime-deep hover:underline">{t.sku}</Link>
                        </td>
                        <td className="px-4 py-2.5 text-ink-soft text-[13px] max-w-xs truncate">{t.name || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular text-[13px] text-ink-muted">{t.previous.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular text-[13px] text-ink font-medium">{t.current.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right"><DeltaBadge value={t.deltaPct} compact /></td>
                        <td className="px-4 py-2.5"><Sparkline values={t.history.slice(-10)} width={80} height={20} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DeltaBadge({ value, compact = false }: { value: number; compact?: boolean }) {
  const isUp = value > 0;
  const isFlat = Math.abs(value) < 1;
  if (isFlat) {
    return <span className={`font-mono ${compact ? "text-xs" : "text-sm"} text-ink-muted`}>±0%</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-mono ${compact ? "text-xs" : "text-sm"} font-semibold ${
        isUp ? "text-lime-deep" : "text-rose"
      }`}
    >
      {isUp ? "↑" : "↓"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function TrendList({
  title, subtitle, tooltip, items, tone, emptyText,
}: {
  title: string; subtitle: string; tooltip: string;
  items: SkuTrend[]; tone: "good" | "bad"; emptyText: string;
}) {
  const toneCls = tone === "good" ? "text-lime-deep" : "text-rose";
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <h2 className={`font-display text-lg font-medium ${toneCls} flex items-center`}>
        {title}
        <InfoTooltip text={tooltip} />
      </h2>
      <p className="text-xs text-ink-muted mt-1">{subtitle}</p>
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-ink-hush text-center py-8">{emptyText}</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {items.map((t, i) => (
            <li key={t.pid} className="flex items-center gap-3 py-1">
              <span className="font-mono text-[10px] text-ink-hush w-5">{i + 1}.</span>
              <div className="flex-1 min-w-0">
                <Link href={`/dashboard/skus/${t.pid}` as any} className="font-mono text-xs text-ink hover:text-lime-deep transition truncate block">
                  {t.sku}
                </Link>
                {t.name && <div className="text-[11px] text-ink-hush truncate">{t.name}</div>}
              </div>
              <Sparkline values={t.history.slice(-8)} width={56} height={18} />
              <div className="text-right shrink-0">
                <div className="font-mono tabular text-xs text-ink-muted">{t.previous.toFixed(2)} → {t.current.toFixed(2)}</div>
                <DeltaBadge value={t.deltaPct} compact />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Sparkline({ values, width = 100, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const isUp = values[values.length - 1] >= values[0];
  const color = isUp ? "#7da82c" : "#c44545";
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
