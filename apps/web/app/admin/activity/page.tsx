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

  // Total snapshots / recalcs вычисляем из bucketed данных для точности
  const totalSnaps = activity.reduce((s, d) => s + d.snapshots, 0);
  const totalRecalcs = activity.reduce((s, d) => s + d.recalcs, 0);
  const avgSnapsDay = Math.round(totalSnaps / 30);
  const avgRecalcsDay = Math.round(totalRecalcs / 30);

  return (
    <div className="space-y-8 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-azure" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-azure font-semibold">Admin / Activity</span>
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Активность</h1>
        <p className="mt-1.5 text-ink-muted text-sm">Snapshots и расчёты метрик за последние 30 дней</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <Stat label="Snapshots за 30д" value={totalSnaps} accent="azure" />
        <Stat label="Расчётов метрик за 30д" value={totalRecalcs} accent="lime" />
        <Stat label="Средний snapshots/день" value={avgSnapsDay} accent="azure" />
        <Stat label="Средний расчётов/день" value={avgRecalcsDay} accent="lime" />
      </section>

      <div className="rounded-2xl border border-line bg-paper p-5 md:p-6">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush mb-4">Динамика по дням</div>
        <ActivityChart data={activity} />
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

function Stat({ label, value, accent }: { label: string; value: number; accent: "lime" | "azure" }) {
  const accentColor = accent === "lime" ? "text-lime-deep" : "text-azure";
  return (
    <div className="rounded-2xl border border-line bg-paper p-5">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className={`mt-2 font-display text-2xl md:text-3xl tracking-tight tabular font-medium ${accentColor}`}>
        {value.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}
