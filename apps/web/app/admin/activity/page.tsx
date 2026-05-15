import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ActivityChart } from "../AdminCharts";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const supabase = createSupabaseAdminClient();
  const day30Ago = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [{ data: snaps }, { data: metrics }] = await Promise.all([
    supabase.from("inventory_snapshots").select("snapshot_time").gte("snapshot_time", day30Ago),
    supabase.from("tvelo_metrics").select("computed_at").gte("computed_at", day30Ago),
  ]);

  const activity = bucketActivity(
    (snaps ?? []).map((r: any) => r.snapshot_time),
    (metrics ?? []).map((r: any) => r.computed_at),
    30,
  );

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Активность</h1>
        <p className="text-sm text-slate-500 mt-1">Snapshots и расчёты метрик за последние 30 дней</p>
      </header>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <ActivityChart data={activity} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Stat label="Всего snapshots, 30д" value={snaps?.length ?? 0} accent="blue" />
        <Stat label="Расчётов метрик, 30д" value={metrics?.length ?? 0} accent="violet" />
      </div>
    </div>
  );
}

function bucketActivity(snapTs: string[], metricsTs: string[], days: number) {
  const snapMap = new Map<string, number>();
  const metMap = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400_000).toISOString().slice(0, 10);
    snapMap.set(d, 0);
    metMap.set(d, 0);
  }
  for (const t of snapTs) {
    const k = t.slice(0, 10);
    if (snapMap.has(k)) snapMap.set(k, (snapMap.get(k) || 0) + 1);
  }
  for (const t of metricsTs) {
    const k = t.slice(0, 10);
    if (metMap.has(k)) metMap.set(k, (metMap.get(k) || 0) + 1);
  }
  return Array.from(snapMap.entries()).map(([date, snapshots]) => ({
    date: new Date(date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    snapshots,
    recalcs: metMap.get(date) ?? 0,
  }));
}

function Stat({ label, value, accent }: { label: string; value: number; accent: "violet" | "blue" }) {
  const colors = accent === "violet" ? "border-l-violet-500" : "border-l-blue-500";
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${colors} rounded-xl p-5`}>
      <div className="text-xs text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value.toLocaleString("ru-RU")}</div>
    </div>
  );
}
