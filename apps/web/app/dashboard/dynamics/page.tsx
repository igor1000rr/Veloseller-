import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../_components/Icons";
import { InfoTooltip } from "../../_components/InfoTooltip";
import DynamicsSearch from "./DynamicsSearch";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchAll<T>(buildQuery: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (offset < 50_000) {
    const { data } = await buildQuery(offset, offset + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

type TveloRow = {
  product_id: string;
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
  deltaPct: number;  // в процентах, +50 или -30
  history: number[];
};

export default async function DynamicsPage({ searchParams }: {
  searchParams: Promise<{ q?: string }>;
}) {
  const sp = await searchParams;
  const search = (sp.q ?? "").trim().toLowerCase();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Грузим все tvelo_metrics за текущего селлера
  const rows = await fetchAll<TveloRow>(
    async (from, to) => await supabase
      .from("tvelo_metrics")
      .select("product_id,period_end,adjusted_velocity,products!inner(sku,product_name,seller_id)")
      .eq("products.seller_id", user.id)
      .order("period_end", { ascending: true })
      .range(from, to),
  );

  // Группируем по SKU и берём history по period_end
  const byProduct = new Map<string, { sku: string; name: string; entries: Array<{ period: string; vel: number }> }>();
  for (const r of rows) {
    const product = Array.isArray(r.products) ? r.products[0] : r.products;
    if (!product) continue;
    if (!byProduct.has(r.product_id)) {
      byProduct.set(r.product_id, { sku: product.sku, name: product.product_name, entries: [] });
    }
    byProduct.get(r.product_id)!.entries.push({
      period: r.period_end,
      vel: Number(r.adjusted_velocity),
    });
  }

  // Для каждого SKU оставляем только уникальные period_end (латест вхождение по каждой дате)
  const trends: SkuTrend[] = [];
  for (const [pid, data] of byProduct) {
    // Сортируем и дедуплицируем period_end
    const sorted = [...data.entries].sort((a, b) => a.period.localeCompare(b.period));
    const dedup = new Map<string, number>();
    for (const e of sorted) {
      dedup.set(e.period, e.vel);  // последнее вхождение по периоду выигрывает
    }
    const sortedByPeriod = Array.from(dedup.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (sortedByPeriod.length < 2) continue;  // нужно минимум 2 точки для дельты

    const history = sortedByPeriod.map(([, v]) => v);
    const current = history[history.length - 1];
    const previous = history[history.length - 2];
    if (previous === 0) continue;  // избегаем деления на ноль

    const deltaPct = ((current - previous) / previous) * 100;
    trends.push({ pid, sku: data.sku, name: data.name, current, previous, deltaPct, history });
  }

  // Топ-10 выросших
  const surging = [...trends]
    .filter(t => t.current >= 0.1 && t.deltaPct > 10)  // отсекаем шум от SKU с почти нулевой скоростью
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 10);

  // Топ-10 просевших
  const sliding = [...trends]
    .filter(t => t.previous >= 0.1 && t.deltaPct < -10)
    .sort((a, b) => a.deltaPct - b.deltaPct)
    .slice(0, 10);

  // Список всех с сортировкой по |delta| + фильтр поиска
  const all = [...trends]
    .filter(t => !search || t.sku.toLowerCase().includes(search) || t.name.toLowerCase().includes(search))
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  const allLimited = all.slice(0, 50);

  // Тренд магазина: avg velocity за каждый период
  const periodToVels = new Map<string, number[]>();
  for (const t of trends) {
    const data = byProduct.get(t.pid);
    if (!data) continue;
    const periodMap = new Map<string, number>();
    for (const e of data.entries) periodMap.set(e.period, e.vel);
    for (const [period, vel] of periodMap) {
      if (!periodToVels.has(period)) periodToVels.set(period, []);
      periodToVels.get(period)!.push(vel);
    }
  }
  const storeTrend = Array.from(periodToVels.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([period, vels]) => ({
      period,
      avg: vels.reduce((a, b) => a + b, 0) / vels.length,
    }));

  const noData = trends.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-lime-deep" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Dynamics</span>
        </div>
        <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Динамика скоростей</h1>
        <p className="text-sm text-ink-muted mt-1">
          Какие SKU ускорились, какие просели — и что делать. Сравнение последних двух периодов пересчёта.
        </p>
      </header>

      {noData ? (
        <div className="rounded-2xl border border-line bg-paper p-10 md:p-14 text-center">
          <div className="size-12 mx-auto rounded-full bg-lime-soft flex items-center justify-center text-lime-deep mb-4">
            <Icons.Health />
          </div>
          <p className="font-display text-xl text-ink font-medium">Накапливается история</p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
            Чтобы видеть динамику, нужно минимум два пересчёта. Дашборд начнёт работать через 1-2 дня регулярных синков.
          </p>
        </div>
      ) : (
        <>
          {/* Тренд магазина */}
          <div className="rounded-2xl border border-line bg-paper p-6">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
              Средняя скорость по магазину
              <InfoTooltip text="Среднее adjusted_velocity по всем SKU за каждый период пересчёта. Подъём = магазин в целом разгоняется, спад = охлаждается." />
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
              <span className="text-xs text-ink-muted font-mono">шт/день</span>
            </div>
            <div className="mt-4">
              <Sparkline values={storeTrend.map(s => s.avg)} />
            </div>
            <div className="mt-2 flex justify-between text-[10px] font-mono text-ink-hush">
              <span>{storeTrend[0]?.period ?? ""}</span>
              <span>{storeTrend[storeTrend.length - 1]?.period ?? ""}</span>
            </div>
          </div>

          {/* Два блока: выросли влево, просели вправо */}
          <div className="grid gap-6 lg:grid-cols-2">
            <TrendList
              title="Что разогналось"
              subtitle="Скорости выросли >10% за последний период"
              tooltip="Кандидаты на пополнение склада: спрос растёт, важно не уйти в OOS. Топ-10 по росту adjusted_velocity."
              items={surging}
              tone="good"
              emptyText="Никто не разогнался — спрос стабильный или падает."
            />
            <TrendList
              title="Что просело"
              subtitle="Скорости упали >10% за последний период"
              tooltip="Что случилось? Закончился сезон, проблема с листингом, выросла цена? Топ-10 по падению adjusted_velocity."
              items={sliding}
              tone="bad"
              emptyText="Никто не просел — все SKU стабильны."
            />
          </div>

          {/* Полная таблица с поиском */}
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <div className="px-5 py-4 border-b border-line bg-bg-soft flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold flex items-center">
                  Все изменения
                  <InfoTooltip text="Топ-50 SKU отсортированы по абсолютной величине изменения скорости. Серым — минимальные изменения, цветные — сильные." />
                </h2>
                <p className="text-xs text-ink-muted mt-1">Отсортировано по силе изменения · {all.length} SKU всего, показано 50</p>
              </div>
              <DynamicsSearch initial={search} />
            </div>
            {allLimited.length === 0 ? (
              <div className="p-10 text-center text-sm text-ink-muted">
                {search ? `По запросу «${search}» ничего не найдено.` : "Нет данных для отображения."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-line">
                    <tr>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">SKU</th>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Название</th>
                      <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Было</th>
                      <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Стало</th>
                      <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Δ</th>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Тренд</th>
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

/** Мини-sparkline SVG — легвес и не требует recharts. */
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
  const color = isUp ? "#7da82c" : "#c44545";  // lime-deep / rose
  return (
    <svg width={width} height={height} className="inline-block">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
