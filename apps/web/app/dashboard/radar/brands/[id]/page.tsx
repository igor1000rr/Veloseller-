import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import BrandQueriesPanel, { type Query } from "./BrandQueriesPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Детальная страница одного бренда.
 * Показывает все запросы (фразы) которые worker насобирал из Wordstat,
 * их частоты, тренд, sparkline по месяцам, статус (early/new/watching/archived).
 *
 * Источник:
 *   radar_queries_view — join radar_queries + radar_brands (brand_name, derived flags)
 *   radar_query_history — помесячные точки frequency для sparkline
 *
 * Что доступно из UI:
 *   - переключение status фразы (favorite, archived) через server actions
 *   - быстрая навигация назад на список брендов
 *   - сводный график «суммарная частота всех фраз бренда по месяцам»
 *     (агрегат по radar_query_history)
 *   - per-фраза sparkline в каждой строке таблицы (последние 6 точек)
 */
export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const sb = await createSupabaseServerClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // 1. Сам бренд
  const { data: brand } = await sb
    .from("radar_brands")
    .select("id, name, status, source, sku_count, avg_price, last_wordstat_at, created_at")
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle();

  if (!brand) notFound();

  // 2. Все запросы этого бренда
  const { data: queriesRaw } = await sb
    .from("radar_queries_view")
    .select("*")
    .eq("seller_id", user.id)
    .eq("brand_id", id)
    .order("current_frequency", { ascending: false, nullsFirst: false })
    .limit(200);
  const queries = queriesRaw ?? [];

  // 3. Помесячная история частот: одним запросом тянем всю history по всем
  //    queryIds, потом раздаём в два бакета:
  //    - monthlyTotals — для большого графика (sum по бренду)
  //    - perQueryHistory — для per-фраза sparkline в таблице
  const queryIds = queries.map((q: any) => q.id);
  let monthlyTotals: { ym: string; total: number }[] = [];
  const perQueryHistory: Record<string, { ym: string; freq: number }[]> = {};

  if (queryIds.length > 0) {
    const { data: history } = await sb
      .from("radar_query_history")
      .select("query_id, period_year, period_month, frequency")
      .in("query_id", queryIds)
      .order("period_year", { ascending: true })
      .order("period_month", { ascending: true });

    const totalBucket = new Map<string, number>();
    for (const row of (history ?? []) as any[]) {
      const key = `${row.period_year}-${String(row.period_month).padStart(2, "0")}`;
      const freq = Number(row.frequency ?? 0);
      // Агрегат для большого графика
      totalBucket.set(key, (totalBucket.get(key) ?? 0) + freq);
      // Per-query разбивка
      if (!perQueryHistory[row.query_id]) perQueryHistory[row.query_id] = [];
      perQueryHistory[row.query_id].push({ ym: key, freq });
    }
    monthlyTotals = Array.from(totalBucket.entries())
      .map(([ym, total]) => ({ ym, total }))
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .slice(-12);
  }

  // 4. Сводки по статусам
  const byStatus = {
    early: queries.filter((q: any) => q.status === "early").length,
    new: queries.filter((q: any) => q.status === "new").length,
    watching: queries.filter((q: any) => q.status === "watching").length,
    archived: queries.filter((q: any) => q.status === "archived").length,
  };

  const lastDays = brand.last_wordstat_at
    ? Math.floor((Date.now() - new Date(brand.last_wordstat_at).getTime()) / 86400000)
    : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link
          href={"/dashboard/radar/brands"}
          className="text-xs font-mono uppercase tracking-wider text-ink-hush hover:text-ink transition mb-2 inline-block"
        >
          ← К списку брендов
        </Link>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-medium tracking-tight text-ink">
              {brand.name}
            </h1>
            <p className="mt-1.5 text-sm text-ink-muted">
              {brand.status === "approved" ? (
                <span className="text-lime-deep">отслеживается</span>
              ) : (
                <span className="text-ink-hush">исключён</span>
              )}
              {brand.source === "ai" ? " · из прайса" : " · добавлен вручную"}
              {brand.sku_count != null && brand.sku_count > 0 && (
                <span> · {brand.sku_count} SKU</span>
              )}
              {lastDays != null && (
                <span> · опрос {lastDays === 0 ? "сегодня" : `${lastDays} дн назад`}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Сводка статусов запросов */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCard label="Ранние сигналы" value={byStatus.early} tone="azure" />
        <StatusCard label="Новые" value={byStatus.new} tone="lime" />
        <StatusCard label="Наблюдение" value={byStatus.watching} tone="orange" />
        <StatusCard label="Архив" value={byStatus.archived} tone="muted" />
      </div>

      {/* Помесячный график */}
      {monthlyTotals.length >= 2 && (
        <MonthlyTrendChart points={monthlyTotals} />
      )}

      {/* Таблица запросов с per-фраза sparkline */}
      <BrandQueriesPanel queries={queries as Query[]} perQueryHistory={perQueryHistory} />
    </div>
  );
}

function StatusCard({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: "azure" | "lime" | "orange" | "muted";
}) {
  const colors: Record<typeof tone, string> = {
    azure:  "border-azure/30 bg-azure/5 text-azure",
    lime:   "border-lime-deep/30 bg-lime-soft text-lime-deep",
    orange: "border-orange/30 bg-orange/5 text-orange",
    muted:  "border-line bg-bg-soft text-ink-hush",
  };
  return (
    <div className={`rounded-xl border ${colors[tone]} px-4 py-3`}>
      <div className="font-mono text-[10px] uppercase tracking-widest font-semibold opacity-80">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-medium text-ink">
        {value}
      </div>
    </div>
  );
}

function MonthlyTrendChart({ points }: { points: { ym: string; total: number }[] }) {
  // Простой inline-SVG sparkline. 12 точек, линия + точки.
  const W = 600;
  const H = 140;
  const PAD = 24;
  const max = Math.max(...points.map(p => p.total), 1);
  const min = Math.min(...points.map(p => p.total), 0);
  const xStep = (W - PAD * 2) / Math.max(points.length - 1, 1);
  const yScale = (v: number) => H - PAD - ((v - min) / (max - min || 1)) * (H - PAD * 2);

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${PAD + i * xStep} ${yScale(p.total)}`)
    .join(" ");

  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-2">
        Суммарная частота фраз по месяцам
      </div>
      <p className="text-xs text-ink-muted mb-3">
        Wordstat по всем фразам бренда. Сглажено по месяцам, последние {points.length} месяцев.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" className="text-lime-deep" />
        {points.map((p, i) => (
          <circle
            key={p.ym}
            cx={PAD + i * xStep}
            cy={yScale(p.total)}
            r="3"
            fill="currentColor"
            className="text-lime-deep"
          >
            <title>{p.ym}: {p.total.toLocaleString("ru-RU")}</title>
          </circle>
        ))}
        {points.map((p, i) => {
          const x = PAD + i * xStep;
          // Подпись только для первого, последнего и середины — иначе нечитаемо
          if (i !== 0 && i !== points.length - 1 && i !== Math.floor(points.length / 2)) return null;
          const [year, month] = p.ym.split("-");
          const label = `${month}.${year.slice(-2)}`;
          return (
            <text
              key={`label-${p.ym}`}
              x={x}
              y={H - 6}
              fontSize="10"
              textAnchor="middle"
              className="fill-current text-ink-hush"
            >
              {label}
            </text>
          );
        })}
        {/* Min/max labels */}
        <text x={4} y={PAD + 4} fontSize="10" className="fill-current text-ink-hush">
          {max.toLocaleString("ru-RU")}
        </text>
        <text x={4} y={H - PAD} fontSize="10" className="fill-current text-ink-hush">
          {min.toLocaleString("ru-RU")}
        </text>
      </svg>
    </div>
  );
}
