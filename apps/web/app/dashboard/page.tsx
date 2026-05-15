import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import RecalcButton from "./RecalcButton";
import { HealthTrend, LostRevenueTrend, SegmentPie } from "./StoreCharts";
import { DayProgress } from "./DayProgress";
import { PeriodSelector } from "./PeriodSelector";
import { DeadInventoryChart } from "./StoreCharts";

export default async function DashboardOverview({ searchParams }: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: "7" | "30" | "90" = (["7", "30", "90"].includes(sp.period ?? "") ? sp.period : "30") as any;
  const periodDays = parseInt(period, 10);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: seller } = await supabase.from("sellers").select("created_at").eq("id", user.id).maybeSingle();
  const daysSinceSetup = seller?.created_at ? Math.floor((Date.now() - new Date(seller.created_at).getTime()) / 86400_000) : 0;

  // Самая свежая запись store_metrics для выбранного периода
  // Длина периода = period_end - period_start (по spec). Фильтруем выборкой с подходящей длиной.
  const periodStartDate = new Date(Date.now() - periodDays * 86400_000);
  const periodStartIso = periodStartDate.toISOString().slice(0, 10);
  const { data: storeMetricsRows } = await supabase
    .from("store_metrics")
    .select("*")
    .eq("seller_id", user.id)
    .gte("period_start", periodStartIso)
    .order("computed_at", { ascending: false })
    .limit(20);
  // Берём первую запись где (period_end - period_start) ≈ periodDays
  const storeMetrics = (storeMetricsRows ?? []).find((r: any) => {
    const len = Math.round((new Date(r.period_end).getTime() - new Date(r.period_start).getTime()) / 86400_000);
    return Math.abs(len - (periodDays - 1)) <= 1;
  }) ?? (storeMetricsRows?.[0] ?? null);

  // История store_metrics за последние 14 дней — для графиков
  const { data: storeHistory } = await supabase
    .from("store_metrics")
    .select("period_end,warehouse_health_score,lost_revenue,total_inventory_value,store_frozen_inventory_value,dead_inventory_sku_count")
    .eq("seller_id", user.id)
    .order("period_end", { ascending: false })
    .limit(14);

  // Velocity всех SKU за выбранный период — для быстрой/средней/медленной KPI
  const { data: skuVelocities } = await supabase
    .from("tvelo_metrics")
    .select("adjusted_velocity,product_id,period_end")
    .order("period_end", { ascending: false })
    .limit(1000);
  const latestByProduct = new Map<string, number>();
  for (const m of skuVelocities ?? []) {
    const pid = (m as any).product_id;
    if (!latestByProduct.has(pid)) latestByProduct.set(pid, Number(m.adjusted_velocity));
  }
  const velocities = Array.from(latestByProduct.values()).filter(v => v > 0).sort((a, b) => a - b);
  const fastVelocity = velocities.length > 0 ? velocities[Math.floor(velocities.length * 0.9)] : 0;
  const avgVelocity = velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0;
  const slowVelocity = velocities.length > 0 ? velocities[Math.floor(velocities.length * 0.1)] : 0;

  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("seller_id", user.id)
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: connectionsCount } = await supabase
    .from("data_connections")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", user.id);

  if ((connectionsCount ?? 0) === 0) {
    return (
      <div className="rounded-2xl border border-brand-100 bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Подключи первый источник данных</h1>
        <p className="mx-auto mt-2 max-w-xl text-slate-600">
          Чтобы Veloseller начал считать TVelo, нужны ежедневные snapshots по твоим SKU.
          Это занимает 5 минут — выбери способ, как тебе удобнее.
        </p>
        <div className="mt-6 flex gap-3 justify-center">
          <Link
            href="/onboarding"
            className="inline-block rounded-xl border border-brand-700 text-brand-700 px-6 py-3 font-semibold hover:bg-brand-50"
          >
            Гид по настройке
          </Link>
          <Link
            href="/connections/new"
            className="inline-block rounded-xl bg-brand-700 px-6 py-3 font-semibold text-white hover:bg-brand-600"
          >
            Подключить источник
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Обзор склада</h1>
        <div className="flex items-center gap-3">
          <PeriodSelector current={period} />
          <RecalcButton />
        </div>
      </div>

      <DayProgress daysSinceSetup={daysSinceSetup} />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Всего SKU" value={storeMetrics?.total_sku_count ?? "—"} />
        <Kpi label="Out-of-stock" value={storeMetrics?.oos_sku_count ?? "—"} tone="warn" />
        <Kpi label="Низкий остаток" value={storeMetrics?.low_stock_sku_count ?? "—"} tone="warn" />
        <Kpi label="Неликвид" value={storeMetrics?.dead_inventory_sku_count ?? "—"} tone="warn" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-500">Inventory Health Score</div>
          <div className="mt-2 text-5xl font-bold text-brand-700">
            {storeMetrics?.warehouse_health_score?.toFixed(0) ?? "—"}
            <span className="text-2xl text-slate-400">/100</span>
          </div>
          <div className="mt-2 text-sm text-slate-600">{scoreLabel(storeMetrics?.warehouse_health_score)}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-500">Денег в остатках</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">
            {formatMoney(storeMetrics?.total_inventory_value)}
          </div>
          <div className="mt-3 text-sm">
            <span className="text-slate-500">Заморожено в неликвиде: </span>
            <span className="font-semibold text-amber-700">
              {formatMoney(storeMetrics?.store_frozen_inventory_value)}
            </span>
          </div>
        </div>
      </div>

      {/* Concentrations */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-500">Концентрация остатков</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {storeMetrics?.inventory_concentration_50 ?? "—"} SKU
          </div>
          <div className="mt-1 text-sm text-slate-600">дают 50% остатков по деньгам</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm text-slate-500">Концентрация спроса</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {storeMetrics?.demand_concentration_50 ?? "—"} SKU
          </div>
          <div className="mt-1 text-sm text-slate-600">дают 50% спроса</div>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-6">
          <div className="text-sm text-red-700">Lost revenue</div>
          <div className="mt-2 text-2xl font-bold text-red-900">
            {formatMoney(storeMetrics?.lost_revenue)}
          </div>
          <div className="mt-1 text-sm text-red-700">недополучено за период из-за OOS</div>
        </div>
      </div>

      {/* 3 скорости продаж по Project.docx Day 7 */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Скорости продаж по SKU</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 border-l-4 border-l-emerald-500 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Быстрая</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">{fastVelocity.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-0.5">топ 10% SKU</div>
          </div>
          <div className="bg-white border border-slate-200 border-l-4 border-l-blue-500 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Средняя</div>
            <div className="mt-1 text-2xl font-bold text-blue-700">{avgVelocity.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-0.5">по всем SKU</div>
          </div>
          <div className="bg-white border border-slate-200 border-l-4 border-l-amber-500 rounded-xl p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Медленная</div>
            <div className="mt-1 text-2xl font-bold text-amber-700">{slowVelocity.toFixed(2)}</div>
            <div className="text-xs text-slate-500 mt-0.5">нижние 10% SKU</div>
          </div>
        </div>
      </div>

      {/* Графики */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Health за 14 дней</h3>
          <HealthTrend history={storeHistory ?? []} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Lost revenue за 14 дней</h3>
          <LostRevenueTrend history={storeHistory ?? []} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Распределение по сегментам</h3>
          <SegmentPie distribution={storeMetrics?.demand_pattern_distribution as any} />
        </div>
      </div>

      {/* Dead inventory (товары >6 мес) — отдельный график по Project.docx */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Неликвид (товары &gt; 6 месяцев)</h3>
        <p className="text-xs text-slate-500 mb-4">Динамика количества SKU и замороженных денег</p>
        <DeadInventoryChart history={storeHistory ?? []} />
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900">Уведомления</h2>
          <ul className="mt-3 space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <span className="font-medium">{kindLabel(a.kind)}: </span>
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return "Недостаточно данных";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Warning";
  if (score >= 40) return "Risky";
  return "Critical";
}

function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function kindLabel(kind: string): string {
  return {
    low_stock: "Низкий остаток",
    critical_stock: "Критический остаток",
    dead_inventory: "Неликвид",
    repeated_stockout: "Повторный дефицит",
    underestimated_sku: "Недооценённый SKU",
  }[kind] ?? kind;
}
