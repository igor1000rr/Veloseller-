import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { RegistrationsChart, SnapshotsChart, PlansPieChart } from "./AdminCharts";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const day7Ago = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const day30Ago = new Date(now.getTime() - 30 * 86400_000).toISOString();
  const day1Ago = new Date(now.getTime() - 86400_000).toISOString();

  const [
    { count: sellersTotal }, { count: sellersTrial }, { count: sellersStarter },
    { count: sellersGrowth }, { count: sellersPro }, { count: sellersNew7d },
    { count: productsTotal }, { count: snapshotsTotal }, { count: snapshots1d },
    { count: alertsUnack }, { count: alertsCritical },
    { count: connectionsTotal }, { count: connectionsError },
    { count: metricsTotal },
    { data: recentSellers30d }, { data: recentSnapshots30d },
    { data: errorConnections },
  ] = await Promise.all([
    supabase.from("sellers").select("id", { count: "exact", head: true }),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "trial"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "starter"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "growth"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).eq("plan", "pro"),
    supabase.from("sellers").select("id", { count: "exact", head: true }).gte("created_at", day7Ago),
    supabase.from("products").select("product_id", { count: "exact", head: true }),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }).gte("snapshot_time", day1Ago),
    supabase.from("alerts").select("id", { count: "exact", head: true }).is("acknowledged_at", null),
    supabase.from("alerts").select("id", { count: "exact", head: true }).is("acknowledged_at", null).eq("kind", "critical_stock"),
    supabase.from("data_connections").select("id", { count: "exact", head: true }),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "error"),
    supabase.from("tvelo_metrics").select("id", { count: "exact", head: true }),
    supabase.from("sellers").select("created_at").gte("created_at", day30Ago),
    supabase.from("inventory_snapshots").select("snapshot_time").gte("snapshot_time", day30Ago),
    supabase.from("data_connections").select("id,name,source,marketplace,last_error,last_sync_at,seller_id,sellers(email)")
      .eq("status", "error").order("last_sync_at", { ascending: false }).limit(8),
  ]);

  const regsByDay = bucketByDay((recentSellers30d ?? []).map((r: any) => r.created_at), 30);
  const snapsByDay = bucketByDay((recentSnapshots30d ?? []).map((r: any) => r.snapshot_time), 30);

  const plansData = [
    { plan: "trial", count: sellersTrial ?? 0 },
    { plan: "starter", count: sellersStarter ?? 0 },
    { plan: "growth", count: sellersGrowth ?? 0 },
    { plan: "pro", count: sellersPro ?? 0 },
  ];

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Обзор платформы</h1>
        <p className="text-sm text-slate-500 mt-1">Все ключевые метрики Veloseller в одном месте</p>
      </header>

      {/* Главные KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BigKpi label="Селлеры" value={sellersTotal ?? 0} delta={`+${sellersNew7d ?? 0} за 7 дней`} accent="violet" />
        <BigKpi label="SKU всего" value={productsTotal ?? 0} accent="blue" />
        <BigKpi label="Snapshots за 24ч" value={snapshots1d ?? 0} accent="indigo" />
        <BigKpi label="Расчётов метрик" value={metricsTotal ?? 0} accent="sky" />
      </section>

      {/* Графики */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Регистрации, 30 дней">
          <RegistrationsChart data={regsByDay} />
        </Card>
        <Card title="Snapshots, 30 дней">
          <SnapshotsChart data={snapsByDay} />
        </Card>
        <Card title="Распределение по планам">
          <PlansPieChart data={plansData} />
          <PlanLegend data={plansData} />
        </Card>
      </section>

      {/* Подметрики */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Состояние данных</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SmallKpi label="Всего snapshots" value={snapshotsTotal ?? 0} />
          <SmallKpi label="Connections" value={connectionsTotal ?? 0} />
          <SmallKpi label="Connection errors" value={connectionsError ?? 0} tone={connectionsError ? "red" : undefined} />
          <SmallKpi label="Alerts unack" value={alertsUnack ?? 0} />
          <SmallKpi label="Critical stock" value={alertsCritical ?? 0} tone={alertsCritical ? "red" : undefined} />
        </div>
      </section>

      {/* Sync errors */}
      {errorConnections && errorConnections.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Последние ошибки sync</h2>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wider">Селлер</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wider">Источник</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wider">Ошибка</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs uppercase tracking-wider">Когда</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {errorConnections.map((c: any) => {
                  const seller = Array.isArray(c.sellers) ? c.sellers[0] : c.sellers;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-900">
                        <Link href={`/admin/sellers/${c.seller_id}` as any} className="text-violet-600 hover:text-violet-700 font-medium">
                          {seller?.email ?? "—"}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{c.marketplace || c.source} · {c.name}</td>
                      <td className="px-4 py-2.5 text-red-600 text-xs max-w-md truncate" title={c.last_error}>{c.last_error}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                        {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString("ru-RU") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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

function BigKpi({ label, value, delta, accent }: { label: string; value: number; delta?: string; accent?: "violet" | "blue" | "indigo" | "sky" }) {
  const accents = {
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
    sky: "bg-sky-50 text-sky-700 border-sky-100",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-sm transition">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value.toLocaleString("ru-RU")}</div>
      {delta && accent && (
        <div className={`inline-flex mt-2 px-2 py-0.5 rounded-md text-xs font-medium border ${accents[accent]}`}>{delta}</div>
      )}
    </div>
  );
}

function SmallKpi({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === "red" ? "text-red-600" : "text-slate-900"}`}>
        {value.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function PlanLegend({ data }: { data: { plan: string; count: number }[] }) {
  const colors: Record<string, string> = {
    trial: "bg-slate-400", starter: "bg-sky-500", growth: "bg-blue-600", pro: "bg-violet-600",
  };
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      {data.map(d => (
        <div key={d.plan} className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${colors[d.plan]}`}></span>
          <span className="text-slate-600 capitalize">{d.plan}</span>
          <span className="text-slate-900 font-medium ml-auto">{d.count}</span>
        </div>
      ))}
    </div>
  );
}
