import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { RegistrationsChart, SnapshotsChart, PlansPieChart } from "./AdminCharts";
import { Icons } from "../_components/Icons";

export const dynamic = "force-dynamic";

// Цены рублевые (Robokassa). Должны совпадать с PLAN_PRICES в lib/robokassa.ts.
const PLAN_PRICE_RUB: Record<string, number> = {
  starter: 2500,
  growth: 6900,
  pro: 14900,
};

export default async function AdminOverview() {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const day7Ago = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const day30Ago = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const day1Ago = new Date(now.getTime() - 86400_000).toISOString();

  const [
    { count: sellersTotal }, { count: sellersTrial }, { count: sellersStarter },
    { count: sellersGrowth }, { count: sellersPro }, { count: sellersNew7d }, { count: sellersNew30d },
    { count: productsTotal }, { count: snapshotsTotal }, { count: snapshots1d },
    { count: alertsUnack }, { count: alertsCritical },
    { count: connectionsTotal }, { count: connectionsError }, { count: connectionsActive },
    { count: metricsTotal }, { count: sellersWithMetrics },
    { data: recentSellers30d }, { data: recentSnapshots30d },
    { data: errorConnections }, { data: recentRegs },
  ] = await Promise.all([
    supabase.from("sellers").select("id", { count: "exact", head: true }),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "trial"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "starter"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "growth"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "pro"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).gte("created_at", day7Ago),
    supabase.from("sellers").select("id", { count: "exact", head: true }).gte("created_at", day30Ago),
    supabase.from("products").select("product_id", { count: "exact", head: true }),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }).gte("snapshot_time", day1Ago),
    supabase.from("alerts").select("id", { count: "exact", head: true }).is("acknowledged_at", null),
    supabase.from("alerts").select("id", { count: "exact", head: true }).is("acknowledged_at", null).eq("kind", "critical_stock"),
    supabase.from("data_connections").select("id", { count: "exact", head: true }),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "error"),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("tvelo_metrics").select("id", { count: "exact", head: true }),
    // Селлеры с store_metrics хотя бы с одной записью — это «расчёт TVelo выполнён» в воронке
    supabase.from("store_metrics").select("seller_id", { count: "exact", head: true }),
    supabase.from("sellers").select("created_at").gte("created_at", day30Ago),
    supabase.from("inventory_snapshots").select("snapshot_time").gte("snapshot_time", day30Ago),
    supabase.from("data_connections").select("id,name,source,marketplace,last_error,last_sync_at,seller_id,sellers(email)")
      .eq("status", "error").order("last_sync_at", { ascending: false }).limit(5),
    supabase.from("sellers").select("id,email,plan,created_at").order("created_at", { ascending: false }).limit(5),
  ]);

  const regsByDay = bucketByDay((recentSellers30d ?? []).map((r: any) => r.created_at), 30);
  const snapsByDay = bucketByDay((recentSnapshots30d ?? []).map((r: any) => r.snapshot_time), 30);

  const plansData = [
    { plan: "trial",   count: sellersTrial   ?? 0 },
    { plan: "starter", count: sellersStarter ?? 0 },
    { plan: "growth",  count: sellersGrowth  ?? 0 },
    { plan: "pro",     count: sellersPro     ?? 0 },
  ];

  // MRR в рублях (Robokassa). Было в USD — НЕПРАВИЛЬНО после перехода со Stripe.
  const mrr = (sellersStarter ?? 0) * PLAN_PRICE_RUB.starter
            + (sellersGrowth ?? 0)  * PLAN_PRICE_RUB.growth
            + (sellersPro ?? 0)     * PLAN_PRICE_RUB.pro;
  const paidTotal = (sellersStarter ?? 0) + (sellersGrowth ?? 0) + (sellersPro ?? 0);
  const conversion = (sellersTotal ?? 0) > 0 ? (paidTotal / (sellersTotal ?? 1)) * 100 : 0;
  const arpu = paidTotal > 0 ? mrr / paidTotal : 0;

  // Воронка. Баг был: metricsTotal ?? 0 > 0 считалось как metricsTotal ?? (0 > 0) = false.
  // Правильный шаг #3: сколько селлеров имеют хотя бы 1 store_metrics запись.
  const funnelSteps = [
    { label: "Регистраций",         value: sellersTotal ?? 0 },
    { label: "Подключёно складов",  value: connectionsActive ?? 0 },
    { label: "Расчёт TVelo выполнен", value: sellersWithMetrics ?? 0 },
    { label: "Платных селлеров",    value: paidTotal },
  ];
  const funnelMax = Math.max(...funnelSteps.map(s => s.value), 1);

  const rubFmt = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

  return (
    <div className="space-y-8 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-orange" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-orange font-semibold">Admin / Overview</span>
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Обзор платформы</h1>
        <p className="mt-1.5 text-ink-muted text-sm">Все ключевые метрики Veloseller в одном месте</p>
      </header>

      {/* Главные KPI */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <BigKpi label="Селлеры" value={sellersTotal ?? 0} delta={`+${sellersNew7d ?? 0} за 7д`} tone="lime" />
        <BigKpi label="MRR" valueText={rubFmt(mrr)} delta={`ARPU ${rubFmt(Math.round(arpu))}`} tone="emerald" />
        <BigKpi label="Активных складов" value={connectionsActive ?? 0} delta={`${connectionsError ?? 0} с ошибкой`} tone={connectionsError ? "orange" : "azure"} />
        <BigKpi label="Conversion trial→paid" value={Number(conversion.toFixed(1))} suffix="%" tone="lime" />
      </section>

      {/* Secondary KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3">
        <SmallKpi label="SKU всего" value={productsTotal ?? 0} />
        <SmallKpi label="Snapshots за 24ч" value={snapshots1d ?? 0} />
        <SmallKpi label="Всего snapshots" value={snapshotsTotal ?? 0} />
        <SmallKpi label="Метрики" value={metricsTotal ?? 0} />
        <SmallKpi label="Alerts unack" value={alertsUnack ?? 0} tone={alertsUnack ? "warn" : undefined} />
        <SmallKpi label="Critical" value={alertsCritical ?? 0} tone={alertsCritical ? "bad" : undefined} />
      </section>

      {/* Графики */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Регистрации · 30 дней" badge={`+${sellersNew30d ?? 0}`}>
          <RegistrationsChart data={regsByDay} />
        </Card>
        <Card title="Snapshots · 30 дней" badge={`${snapshots1d ?? 0} за сутки`}>
          <SnapshotsChart data={snapsByDay} />
        </Card>
        <Card title="Распределение по планам">
          <PlansPieChart data={plansData} />
          <PlanLegend data={plansData} />
        </Card>
      </section>

      {/* Funnel */}
      <section>
        <SectionTitle>Воронка конверсии</SectionTitle>
        <div className="rounded-2xl border border-line bg-paper p-5 md:p-6">
          <div className="space-y-3">
            {funnelSteps.map((s, i) => {
              const pct = (s.value / funnelMax) * 100;
              const next = funnelSteps[i + 1];
              const dropoff = next && s.value > 0 ? (((s.value - next.value) / s.value) * 100) : null;
              return (
                <div key={i}>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-[10px] text-ink-hush tabular">0{i + 1}</span>
                      <span className="text-sm text-ink-soft">{s.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {dropoff !== null && dropoff > 0 && (
                        <span className="font-mono text-[10px] text-rose">-{dropoff.toFixed(0)}%</span>
                      )}
                      <span className="font-display text-lg text-ink tabular font-medium">{s.value}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-bg-soft overflow-hidden">
                    <div className="h-full rounded-full bg-lime-deep" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Recent Registrations */}
      {recentRegs && recentRegs.length > 0 && (
        <section>
          <SectionTitle>Последние регистрации</SectionTitle>
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <div className="divide-y divide-line">
              {recentRegs.map((r: any) => (
                <Link key={r.id} href={`/admin/sellers/${r.id}` as any} className="flex items-center justify-between px-4 md:px-5 py-3 hover:bg-bg-soft transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-full bg-bg-soft border border-line flex items-center justify-center font-display text-sm font-medium text-ink-muted shrink-0">
                      {(r.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-ink truncate">{r.email}</div>
                      <div className="font-mono text-[10px] text-ink-hush">{new Date(r.created_at).toLocaleString("ru-RU")}</div>
                    </div>
                  </div>
                  <PlanBadge plan={r.plan} />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Sync errors */}
      {errorConnections && errorConnections.length > 0 && (
        <section>
          <SectionTitle tone="warn">Ошибки синхронизации</SectionTitle>
          <div className="rounded-2xl border border-orange/30 bg-orange/[0.04] overflow-hidden">
            <div className="divide-y divide-orange/15">
              {errorConnections.map((c: any) => {
                const seller = Array.isArray(c.sellers) ? c.sellers[0] : c.sellers;
                return (
                  <div key={c.id} className="px-4 md:px-5 py-3 hover:bg-orange/[0.06] transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/admin/sellers/${c.seller_id}` as any} className="text-sm text-ink hover:text-lime-deep font-medium transition">
                          {seller?.email ?? "—"}
                        </Link>
                        <div className="mt-0.5 font-mono text-[11px] text-ink-hush">
                          {c.marketplace || c.source} · {c.name}
                        </div>
                        <div className="mt-1 text-xs text-orange truncate" title={c.last_error}>{c.last_error}</div>
                      </div>
                      <div className="font-mono text-[10px] text-ink-hush whitespace-nowrap shrink-0">
                        {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString("ru-RU") : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function bucketByDay(timestamps: string[], days: number): { date: string; count: number }[] {
  const map = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    map.set(key, 0);
  }
  for (const ts of timestamps) {
    const key = ts.slice(0, 10);
    if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).map(([date, count]) => ({
    date: new Date(date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    count,
  }));
}

function BigKpi({ label, value, valueText, delta, prefix, suffix, tone }: {
  label: string; value?: number; valueText?: string; delta?: string; prefix?: string; suffix?: string;
  tone: "lime" | "emerald" | "orange" | "azure";
}) {
  const accents = {
    lime:    "border-lime-deep/30 bg-lime-soft text-lime-deep",
    emerald: "border-emerald/30 bg-emerald/10 text-emerald",
    orange:  "border-orange/30 bg-orange/10 text-orange",
    azure:   "border-azure/30 bg-azure/10 text-azure",
  };
  const displayValue = valueText !== undefined
    ? valueText
    : `${prefix ?? ""}${typeof value === "number" ? value.toLocaleString("ru-RU") : value}${suffix ?? ""}`;
  return (
    <div className="bg-paper border border-line rounded-2xl p-5 md:p-6 hover:shadow-sm transition">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className="mt-2 font-display text-3xl md:text-4xl tracking-tight tabular font-medium text-ink">
        {displayValue}
      </div>
      {delta && (
        <div className={`inline-flex mt-3 px-2 py-0.5 rounded-md font-mono text-[10px] uppercase tracking-widest border ${accents[tone]}`}>
          {delta}
        </div>
      )}
    </div>
  );
}

function SmallKpi({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  const color = tone === "bad" ? "text-rose" : tone === "warn" ? "text-orange" : "text-ink";
  return (
    <div className="bg-paper border border-line rounded-xl p-3 md:p-4">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className={`mt-1.5 font-display text-xl md:text-2xl tabular font-medium ${color}`}>
        {value.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}

function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper border border-line rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{title}</h3>
        {badge && <span className="font-mono text-[10px] text-lime-deep font-semibold">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ children, tone }: { children: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`size-1 rounded-full ${tone === "warn" ? "bg-orange" : "bg-lime-deep"}`} />
      <h2 className={`font-mono text-[10px] uppercase tracking-[0.2em] font-semibold ${tone === "warn" ? "text-orange" : "text-lime-deep"}`}>
        {children}
      </h2>
    </div>
  );
}

function PlanLegend({ data }: { data: { plan: string; count: number }[] }) {
  const colors: Record<string, string> = {
    trial: "bg-ink-hush", starter: "bg-azure", growth: "bg-lime", pro: "bg-lime-deep",
  };
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      {data.map(d => (
        <div key={d.plan} className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${colors[d.plan] || "bg-ink-hush"}`}></span>
          <span className="text-ink-muted capitalize font-mono text-[11px]">{d.plan}</span>
          <span className="text-ink font-medium ml-auto tabular font-mono text-[11px]">{d.count}</span>
        </div>
      ))}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const cls = plan === "pro"     ? "bg-lime-deep text-paper"
            : plan === "growth"  ? "bg-lime text-ink"
            : plan === "starter" ? "bg-azure/15 text-azure border border-azure/30"
            :                       "bg-bg-soft text-ink-muted border border-line";
  return (
    <span className={`shrink-0 inline-block font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded font-semibold ${cls}`}>
      {plan}
    </span>
  );
}
