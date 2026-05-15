import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SkuAnalysisChart, type ChartPoint } from "./SkuAnalysisChart";
import { ReorderPanel } from "./ReorderPanel";
import { HealthKpi, buildHealthBreakdown, buildConfidenceBreakdown } from "./HealthTooltip";

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

  // Snapshots за последние 60 дней
  const day60Ago = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data: snapshots } = await supabase
    .from("inventory_snapshots")
    .select("snapshot_time,stock_quantity,price,availability")
    .eq("product_id", id)
    .gte("snapshot_time", day60Ago)
    .order("snapshot_time");

  // TVelo metrics последние периоды (для динамики)
  const { data: metrics } = await supabase
    .from("tvelo_metrics")
    .select("*")
    .eq("product_id", id)
    .order("period_end", { ascending: false })
    .limit(30);

  // Price elasticity history (Rule 12.3)
  const { data: elasticity } = await supabase
    .from("price_elasticity")
    .select("change_date,previous_price,new_price,price_delta_pct,velocity_before,velocity_after,price_impact_percent,days_before,days_after")
    .eq("product_id", id)
    .order("change_date", { ascending: false })
    .limit(10);

  // Changelog по этому SKU
  const day30Ago = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const { data: changelog } = await supabase
    .from("changelog")
    .select("event_date,event_type,delta_stock,message,confidence_impact")
    .eq("product_id", id)
    .gte("event_date", day30Ago)
    .order("event_date", { ascending: false })
    .limit(60);

  const latest = metrics?.[0];

  // Группируем snapshots по дням (latest of day)
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
  // Подмешиваем velocity из metrics по period_end
  for (const m of metrics ?? []) {
    const day = m.period_end as string;
    if (byDay.has(day)) {
      byDay.get(day)!.velocity = Number(m.adjusted_velocity);
    }
  }
  const chartData = Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Группируем changelog entries по дате — для tooltip popover
  const changelogByDate: Record<string, any[]> = {};
  for (const e of (changelog ?? [])) {
    const day = (e as any).event_date as string;
    if (!changelogByDate[day]) changelogByDate[day] = [];
    changelogByDate[day].push(e);
  }

  return (
    <div className="space-y-6">
      <header>
        <Link href="/dashboard/skus" className="text-sm text-teal-700 hover:text-teal-800">← Все SKU</Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">
          <span className="font-mono">{product.sku}</span>
          <span className="text-slate-500 font-normal ml-3">{product.product_name}</span>
        </h1>
      </header>

      {/* KPI */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="TVelo" value={Number(latest.adjusted_velocity).toFixed(2)} sub="ед./день" />
          <Kpi label="Покрытие" value={latest.coverage_days != null ? `${Number(latest.coverage_days).toFixed(0)} дн` : "—"} />
          <Kpi label="Остаток" value={latest.current_stock} sub={`× ${Number(latest.current_price).toFixed(0)}`} />
          <HealthKpi label="Confidence" value={`${Number(latest.confidence_score).toFixed(0)}%`}
                     breakdown={buildConfidenceBreakdown(latest)} accent="blue" />
          <HealthKpi label="Health" value={`${Number(latest.sku_health_score ?? 0).toFixed(0)}/100`}
                     breakdown={buildHealthBreakdown(latest)} accent="violet" />
        </div>
      )}

      {/* График анализа товара */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Анализ SKU</h2>
        {chartData.length < 2 ? (
          <p className="text-sm text-slate-500">Недостаточно данных для графика (нужно 2+ дня)</p>
        ) : (
          <SkuAnalysisChart data={chartData} changelogByDate={changelogByDate} />
        )}
      </div>

      {/* Reorder calculator (Rule 1.6 + 8.1) */}
      {latest && Number(latest.adjusted_velocity) > 0 && (
        <ReorderPanel
          productId={product.product_id}
          adjustedVelocity={Number(latest.adjusted_velocity)}
          currentStock={Number(latest.current_stock)}
          leadTimeDays={leadTime}
          safetyDays={safety}
        />
      )}

      {/* Price elasticity (Rule 12.3) */}
      {(elasticity ?? []).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Влияние цены на скорость</h2>
          <p className="text-sm text-slate-500 mb-4">Velocity до и после смены цены (минимум 7 in-stock дней с каждой стороны)</p>
          <div className="grid gap-3">
            {(elasticity ?? []).map((e: any, i: number) => {
              const impact = Number(e.price_impact_percent);
              const positiveImpact = impact > 0;
              return (
                <div key={i} className="flex items-center gap-6 p-4 border border-slate-100 rounded-xl">
                  <div className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(e.change_date).toLocaleDateString("ru-RU")}
                  </div>
                  <div className="text-sm">
                    <span className="text-slate-500">Цена:</span>{" "}
                    <span className="font-mono">{Number(e.previous_price).toFixed(2)}</span>
                    {" → "}
                    <span className="font-mono font-semibold">{Number(e.new_price).toFixed(2)}</span>
                    <span className={`ml-2 text-xs ${Number(e.price_delta_pct) > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      ({Number(e.price_delta_pct) > 0 ? "+" : ""}{Number(e.price_delta_pct).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="text-sm flex-1">
                    <span className="text-slate-500">Velocity:</span>{" "}
                    <span className="font-mono">{Number(e.velocity_before).toFixed(2)}</span>
                    {" → "}
                    <span className="font-mono font-semibold">{Number(e.velocity_after).toFixed(2)}</span>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${
                    positiveImpact ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                  }`}>
                    {positiveImpact ? "+" : ""}{impact.toFixed(1)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Changelog за месяц */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">События за последние 30 дней</h2>
        {(changelog ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">Событий нет</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {(changelog ?? []).map((e: any, i: number) => (
              <li key={i} className="py-2 flex items-start gap-4 text-sm">
                <span className="text-slate-500 text-xs whitespace-nowrap w-24 mt-0.5">
                  {new Date(e.event_date).toLocaleDateString("ru-RU")}
                </span>
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium w-32 text-center ${TYPE_STYLES[e.event_type] ?? "bg-slate-100"}`}>
                  {TYPE_LABELS[e.event_type] ?? e.event_type}
                </span>
                <span className="text-slate-700 flex-1">{e.message}</span>
                {e.confidence_impact != null && Number(e.confidence_impact) !== 0 && (
                  <span className="text-xs text-amber-700 whitespace-nowrap">conf {Number(e.confidence_impact).toFixed(1)}%</span>
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
  sales_like: "Продажа",
  replenishment_like: "Пополнение",
  anomaly_like: "Аномалия",
  missing_data: "Нет данных",
  recount_like: "Цена",
};

const TYPE_STYLES: Record<string, string> = {
  first_snapshot: "bg-slate-100 text-slate-700",
  sales_like: "bg-emerald-100 text-emerald-800",
  replenishment_like: "bg-blue-100 text-blue-800",
  anomaly_like: "bg-amber-100 text-amber-800",
  missing_data: "bg-slate-100 text-slate-700",
  recount_like: "bg-violet-100 text-violet-800",
};

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
