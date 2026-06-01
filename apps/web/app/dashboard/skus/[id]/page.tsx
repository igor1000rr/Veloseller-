import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SkuAnalysisChart, type ChartPoint } from "./SkuAnalysisChart";
import { ReorderPanel } from "./ReorderPanel";
import { HealthKpi, buildHealthBreakdown, buildConfidenceBreakdown } from "./HealthTooltip";
import { Icons } from "../../../_components/Icons";
import { InfoTooltip } from "../../../_components/InfoTooltip";

export const dynamic = "force-dynamic";

export default async function SkuDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: product } = await supabase
    .from("products")
    .select("product_id,sku,product_name,seller_id,lead_time_days,safety_days")
    .eq("product_id", id).eq("seller_id", user.id).maybeSingle();
  if (!product) notFound();

  const { data: seller } = await supabase
    .from("sellers").select("default_lead_time_days,default_safety_days").eq("id", user.id).single();
  const leadTime = product.lead_time_days ?? seller?.default_lead_time_days ?? 14;
  const safety = product.safety_days ?? seller?.default_safety_days ?? 7;

  const day60Ago = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data: snapshots } = await supabase
    .from("inventory_snapshots")
    .select("snapshot_time,stock_quantity,price,availability")
    .eq("product_id", id)
    .gte("snapshot_time", day60Ago)
    .order("snapshot_time");

  const { data: metrics } = await supabase
    .from("tvelo_metrics")
    .select("*")
    .eq("product_id", id)
    .order("period_end", { ascending: false })
    .limit(30);

  const { data: elasticity } = await supabase
    .from("price_elasticity")
    .select("change_date,previous_price,new_price,price_delta_pct,velocity_before,velocity_after,price_impact_percent,days_before,days_after")
    .eq("product_id", id)
    .order("change_date", { ascending: false })
    .limit(10);

  const day30Ago = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  // Александр 01.06.2026: "фиксация всех event_type кроме sales_like".
  // sales_like — обычные продажи которые засоряют список. Отфильтровываем
  // на уровне запроса — экономим bytes и парсинг.
  const { data: changelog } = await supabase
    .from("changelog")
    .select("event_date,event_type,delta_stock,message,confidence_impact")
    .eq("product_id", id)
    .neq("event_type", "sales_like")
    .gte("event_date", day30Ago)
    .order("event_date", { ascending: false })
    .limit(60);

  const latest = metrics?.[0];

  const byDay = new Map<string, ChartPoint>();
  for (const s of snapshots ?? []) {
    const day = new Date(s.snapshot_time).toISOString().slice(0, 10);
    byDay.set(day, {
      date: day,
      stock: s.stock_quantity,
      price: Number(s.price),
      availability: s.availability ? 1 : 0,
      velocity: 0,
    });
  }
  for (const m of metrics ?? []) {
    const day = m.period_end as string;
    if (byDay.has(day)) byDay.get(day)!.velocity = Number(m.adjusted_velocity);
  }
  const chartData = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

  const changelogByDate: Record<string, any[]> = {};
  for (const e of (changelog ?? [])) {
    const day = (e as any).event_date as string;
    if (!changelogByDate[day]) changelogByDate[day] = [];
    changelogByDate[day].push(e);
  }

  let adjVsMedian = "";
  if (latest && latest.median_30d_velocity != null) {
    const adj = Number(latest.adjusted_velocity);
    const med = Number(latest.median_30d_velocity);
    if (med > 0 && adj > 0) {
      const diffPct = ((adj - med) / med) * 100;
      const sign = diffPct >= 0 ? "+" : "";
      adjVsMedian = `${sign}${diffPct.toFixed(0)}% от медианы`;
    }
  }

  // Computed KPI по правкам Александра 01.06.2026:
  // Упущенная выручка = TVelo × stockout_days × price
  // Рекомендуемая закупка на 30 дней = TVelo × 30
  const tvelo = latest ? Number(latest.adjusted_velocity ?? 0) : 0;
  const stockoutDays = latest ? Number(latest.stockout_days ?? 0) : 0;
  const price = latest ? Number(latest.current_price ?? 0) : 0;
  const lostRevenue = tvelo * stockoutDays * price;
  const lostUnits = Math.round(tvelo * stockoutDays);
  const recommendedReorder30 = Math.round(tvelo * 30);

  return (
    <div className="space-y-6">
      <header>
        <Link href="/dashboard/skus" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-lime-deep transition py-1">
          <span className="rotate-180"><Icons.ArrowRight size={12} /></span> Все SKU
        </Link>
        <div className="mt-3 flex items-baseline gap-2 sm:gap-3 flex-wrap">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink break-words">{product.product_name}</h1>
        </div>
        <div className="mt-1 font-mono text-xs text-ink-hush uppercase tracking-wider">
          SKU: <span className="text-ink-soft normal-case">{product.sku}</span>
        </div>
      </header>

      {/* Верхний блок KPI — переработан 01.06.2026 по ТЗ Александра.
          Поля: Health Score, TVelo (3 мес), Покрытие, Достоверность,
          Дней без наличия (1 мес), Упущенная выручка, Рекомендуемая закупка 30д. */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
          <HealthKpi
            label="Health Score"
            value={`${Number(latest.sku_health_score ?? 0).toFixed(0)}/100`}
            breakdown={buildHealthBreakdown(latest)}
            accent="violet"
          />
          <Kpi
            label="TVelo (3 мес)"
            value={tvelo.toFixed(2)}
            sub={adjVsMedian || "шт/день"}
          />
          <Kpi
            label="Покрытие"
            value={latest.coverage_days != null ? `${Number(latest.coverage_days).toFixed(0)} д.` : "—"}
            sub="дней до конца остатков"
          />
          <HealthKpi
            label="Достоверность"
            value={`${Number(latest.confidence_score ?? 0).toFixed(0)}%`}
            breakdown={buildConfidenceBreakdown(latest)}
            accent="blue"
          />
          <Kpi
            label="Дней без наличия"
            value={stockoutDays > 0 ? `${stockoutDays}` : "0"}
            sub="за последний месяц"
            tone={stockoutDays > 0 ? "warn" : undefined}
          />
          <Kpi
            label="Упущенная выручка"
            value={lostRevenue > 0 ? Math.round(lostRevenue).toLocaleString("ru-RU") : "0"}
            sub={lostRevenue > 0 ? `${lostUnits} шт × TVelo × OOS × цена` : "товар не уходил в ноль"}
            tone={lostRevenue > 0 ? "danger" : undefined}
          />
          <Kpi
            label="Рекомендуемая закупка"
            value={recommendedReorder30 > 0 ? recommendedReorder30.toLocaleString("ru-RU") : "—"}
            sub="на 30 дней (TVelo × 30)"
            tone={recommendedReorder30 > 0 ? "accent" : undefined}
          />
          <Kpi
            label="Остаток"
            value={latest.current_stock != null ? Number(latest.current_stock).toLocaleString("ru-RU") : "—"}
            sub={price > 0 ? `× ${price.toLocaleString("ru-RU")} ₽` : undefined}
          />
        </div>
      )}

      {/* Основной график — TVelo (зелёная), Цена (красная), Остаток/OOS (серые столбцы, красный bg).
          Использует существующий SkuAnalysisChart — он уже рисует то что описал Александр. */}
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-4">Анализ SKU</h2>
        {chartData.length < 2 ? (
          <p className="text-sm text-ink-muted">Недостаточно данных для графика (нужно 2+ дня)</p>
        ) : (
          <SkuAnalysisChart data={chartData} changelogByDate={changelogByDate} />
        )}
      </div>

      {latest && Number(latest.adjusted_velocity) > 0 && (
        <ReorderPanel
          productId={product.product_id}
          adjustedVelocity={Number(latest.adjusted_velocity)}
          currentStock={Number(latest.current_stock)}
          leadTimeDays={leadTime}
          safetyDays={safety}
        />
      )}

      {(elasticity ?? []).length > 0 && (
        <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">Price elasticity</h2>
          <h3 className="font-display text-base sm:text-lg font-medium text-ink mt-1">Влияние цены на скорость</h3>
          <p className="text-sm text-ink-muted mb-4">Velocity до и после смены цены (минимум 7 in-stock дней с каждой стороны)</p>
          <div className="grid gap-3">
            {(elasticity ?? []).map((e: any, i: number) => {
              const impact = Number(e.price_impact_percent);
              const positiveImpact = impact > 0;
              return (
                <div key={i} className="flex items-center gap-3 sm:gap-4 md:gap-6 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft flex-wrap">
                  <div className="font-mono text-xs text-ink-hush whitespace-nowrap">
                    {new Date(e.change_date).toLocaleDateString("ru-RU")}
                  </div>
                  <div className="text-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Цена:</span>{" "}
                    <span className="font-mono text-ink-soft">{Number(e.previous_price).toFixed(2)}</span>
                    {" → "}
                    <span className="font-mono font-semibold text-ink">{Number(e.new_price).toFixed(2)}</span>
                    <span className={`ml-2 font-mono text-xs font-semibold ${Number(e.price_delta_pct) > 0 ? "text-orange" : "text-lime-deep"}`}>
                      ({Number(e.price_delta_pct) > 0 ? "+" : ""}{Number(e.price_delta_pct).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="text-sm flex-1 min-w-[180px]">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Velocity:</span>{" "}
                    <span className="font-mono text-ink-soft">{Number(e.velocity_before).toFixed(2)}</span>
                    {" → "}
                    <span className="font-mono font-semibold text-ink">{Number(e.velocity_after).toFixed(2)}</span>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg font-mono text-sm font-semibold whitespace-nowrap ${
                    positiveImpact ? "bg-lime-soft text-lime-deep border border-lime-deep/30" : "bg-rose/10 text-rose border border-rose/30"
                  }`}>
                    {positiveImpact ? "+" : ""}{impact.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* "Последние события" — фиксация всех event_type кроме sales_like.
          Включает изменения цены (отображаются как replenishment_like с price diff)
          и аномалии. sales_like засорял список. */}
      <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">События</h2>
        <h3 className="font-display text-base sm:text-lg font-medium text-ink mt-1 mb-4">
          Последние события за 30 дней
          <InfoTooltip text="Все события кроме обычных продаж. Здесь видны пополнения, аномалии, пересчёты — то что повлияло на расчёт скорости." />
        </h3>
        {(changelog ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">За последний месяц значимых событий не было</p>
        ) : (
          <ul className="divide-y divide-line">
            {(changelog ?? []).map((e: any, i: number) => (
              <li key={i} className="py-2.5 flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-4 text-sm">
                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                  <span className="text-ink-hush text-xs whitespace-nowrap sm:w-24 font-mono">
                    {new Date(e.event_date).toLocaleDateString("ru-RU")}
                  </span>
                  <span className={`inline-flex items-center justify-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold sm:w-32 whitespace-nowrap ${TYPE_STYLES[e.event_type] ?? "text-ink-soft bg-bg-soft border-line"}`}>
                    {TYPE_LABELS[e.event_type] ?? e.event_type}
                  </span>
                </div>
                <span className="text-ink-soft flex-1 break-words">{e.message}</span>
                {e.confidence_impact != null && Number(e.confidence_impact) !== 0 && (
                  <span className="font-mono text-xs text-orange whitespace-nowrap shrink-0">−{Math.abs(Number(e.confidence_impact)).toFixed(1)}%</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  first_snapshot: "Старт",
  replenishment_like: "Пополнение",
  anomaly_like: "Аномалия",
  missing_data: "Нет данных",
  recount_like: "Пересчёт",
  price_change: "Изменение цены",
};

const TYPE_STYLES: Record<string, string> = {
  first_snapshot:     "text-ink-soft bg-bg-soft border-line",
  replenishment_like: "text-azure bg-azure/10 border-azure/30",
  anomaly_like:       "text-orange bg-orange/10 border-orange/30",
  missing_data:       "text-ink-soft bg-bg-soft border-line",
  recount_like:       "text-azure bg-azure/10 border-azure/30",
  price_change:       "text-rose bg-rose/10 border-rose/30",
};

function Kpi({ label, value, sub, tone }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "warn" | "danger" | "accent";
}) {
  const valueColor =
    tone === "warn"   ? "text-orange" :
    tone === "danger" ? "text-rose" :
    tone === "accent" ? "text-lime-deep" :
                        "text-ink";
  return (
    <div className="rounded-xl border border-line bg-paper p-3 sm:p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className={`mt-1 font-display text-lg sm:text-xl md:text-2xl tabular font-medium break-words ${valueColor}`}>{value}</div>
      {sub && <div className="text-xs text-ink-hush mt-0.5 font-mono truncate">{sub}</div>}
    </div>
  );
}
