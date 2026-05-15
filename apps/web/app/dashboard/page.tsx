import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import RecalcButton from "./RecalcButton";
import { HealthTrend, LostRevenueTrend, SegmentPie } from "./StoreCharts";
import { DayProgress } from "./DayProgress";
import { PeriodSelector } from "./PeriodSelector";
import { DeadInventoryChart } from "./StoreCharts";
import { HealthScoreBlock } from "./HealthScale";

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

  const periodStartDate = new Date(Date.now() - periodDays * 86400_000);
  const periodStartIso = periodStartDate.toISOString().slice(0, 10);
  const { data: storeMetricsRows } = await supabase
    .from("store_metrics")
    .select("*")
    .eq("seller_id", user.id)
    .gte("period_start", periodStartIso)
    .order("computed_at", { ascending: false })
    .limit(20);
  const storeMetrics = (storeMetricsRows ?? []).find((r: any) => {
    const len = Math.round((new Date(r.period_end).getTime() - new Date(r.period_start).getTime()) / 86400_000);
    return Math.abs(len - (periodDays - 1)) <= 1;
  }) ?? (storeMetricsRows?.[0] ?? null);

  const { data: storeHistory } = await supabase
    .from("store_metrics")
    .select("period_end,warehouse_health_score,lost_revenue,total_inventory_value,store_frozen_inventory_value,dead_inventory_sku_count")
    .eq("seller_id", user.id)
    .order("period_end", { ascending: false })
    .limit(14);

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
      <div className="rounded-2xl border border-line bg-paper p-8 md:p-10 text-center">
        <h1 className="font-display text-2xl md:text-3xl font-medium text-ink">Подключи первый источник данных</h1>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted">
          Чтобы Veloseller начал считать TVelo, нужны ежедневные snapshots по твоим SKU.
          Это занимает 5 минут — выбери способ, как тебе удобнее.
        </p>
        <div className="mt-6 flex gap-3 justify-center flex-wrap">
          <Link
            href={"/onboarding" as any}
            className="inline-flex items-center rounded-lg border border-line bg-bg-soft text-ink px-5 py-3 font-semibold hover:border-lime-deep/40 transition"
          >
            Гид по настройке
          </Link>
          <Link
            href={"/connections/new" as any}
            className="inline-flex items-center rounded-lg bg-ink text-paper px-5 py-3 font-semibold hover:bg-ink-soft transition"
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
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">Обзор склада</h1>
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

      {/* Health + Inventory value */}
      <div className="grid gap-6 md:grid-cols-2">
        <HealthScoreBlock score={storeMetrics?.warehouse_health_score} />

        <div className="rounded-2xl border border-line bg-paper p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">Денег в остатках</div>
          <div className="mt-3 font-display text-4xl md:text-5xl tracking-tight font-medium text-ink tabular">
            {formatMoney(storeMetrics?.total_inventory_value)}
          </div>
          <div className="mt-4 rounded-lg border border-orange/20 bg-orange/5 p-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold">Заморожено в неликвиде</span>
            <span className="font-display tabular text-xl text-orange font-medium">
              {formatMoney(storeMetrics?.store_frozen_inventory_value)}
            </span>
          </div>
        </div>
      </div>

      {/* Concentrations */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Концентрация остатков</div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {storeMetrics?.inventory_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">дают 50% остатков по деньгам</div>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">Концентрация спроса</div>
          <div className="mt-2 font-display text-2xl tabular text-ink font-medium">
            {storeMetrics?.demand_concentration_50 ?? "—"} <span className="text-base text-ink-muted">SKU</span>
          </div>
          <div className="mt-1 text-xs text-ink-muted">дают 50% спроса</div>
        </div>
        <div className="rounded-2xl border border-rose/30 bg-rose/5 p-5">
          <div className="font-mono text-[10px] uppercase tracking-widest text-rose font-semibold">Lost revenue</div>
          <div className="mt-2 font-display text-2xl tabular text-rose font-medium">
            {formatMoney(storeMetrics?.lost_revenue)}
          </div>
          <div className="mt-1 text-xs text-rose/80">недополучено за период из-за OOS</div>
        </div>
      </div>

      {/* 3 скорости продаж (Project.docx Day 7) */}
      <div>
        <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">Скорости продаж по SKU</h3>
        <div className="grid grid-cols-3 gap-3">
          <VelocityCard label="Быстрая" value={fastVelocity} sub="топ 10% SKU" tone="fast" />
          <VelocityCard label="Средняя" value={avgVelocity}  sub="по всем SKU"  tone="mid" />
          <VelocityCard label="Медленная" value={slowVelocity} sub="нижние 10%" tone="slow" />
        </div>
      </div>

      {/* Графики */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Health за 14 дней"><HealthTrend history={storeHistory ?? []} /></ChartCard>
        <ChartCard title="Lost revenue за 14 дней"><LostRevenueTrend history={storeHistory ?? []} /></ChartCard>
        <ChartCard title="Распределение по сегментам"><SegmentPie distribution={storeMetrics?.demand_pattern_distribution as any} /></ChartCard>
      </div>

      {/* Dead inventory */}
      <div className="rounded-2xl border border-line bg-paper p-6">
        <h3 className="font-display text-lg font-medium text-ink">Неликвид (товары &gt; 6 месяцев)</h3>
        <p className="text-xs text-ink-muted mt-1 mb-4">Динамика количества SKU и замороженных денег</p>
        <DeadInventoryChart history={storeHistory ?? []} />
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="rounded-2xl border border-line bg-paper p-6">
          <h2 className="font-display text-lg font-medium text-ink">Уведомления</h2>
          <ul className="mt-3 space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-lg border border-line bg-bg-soft p-3 text-sm text-ink-soft">
                <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold mr-2">{kindLabel(a.kind)}</span>
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
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{label}</div>
      <div className={`mt-1.5 font-display text-2xl md:text-3xl tabular font-medium tracking-tight ${tone === "warn" ? "text-orange" : "text-ink"}`}>
        {value}
      </div>
    </div>
  );
}

function VelocityCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: "fast" | "mid" | "slow" }) {
  const cls =
    tone === "fast" ? "border-l-lime-deep text-lime-deep" :
    tone === "mid"  ? "border-l-azure text-azure" :
                      "border-l-orange text-orange";
  return (
    <div className={`bg-paper border border-line border-l-4 rounded-xl p-4 ${cls.replace("text-", "")}`}>
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{label}</div>
      <div className={`mt-1 font-display text-2xl tabular font-medium ${cls.split(" ")[1]}`}>{value.toFixed(2)}</div>
      <div className="text-[10px] text-ink-hush mt-0.5 font-mono uppercase tracking-wider">{sub}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6">
      <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
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
