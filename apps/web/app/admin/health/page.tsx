import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { HealthRadial, HourlyHeatmap } from "../AdminCharts";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const supabase = createSupabaseAdminClient();
  const day1Ago = new Date(Date.now() - 86400_000).toISOString();
  const day7Ago = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [
    { count: connectionsTotal },
    { count: connectionsActive },
    { count: connectionsError },
    { count: connectionsIdle },
    { count: snapshots1d },
    { count: snapshots7d },
    { data: snapshots1dRows },
    { data: connectionsBySource },
    { data: errorConns },
  ] = await Promise.all([
    supabase.from("data_connections").select("id", { count: "exact", head: true }),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "error"),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "idle"),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }).gte("snapshot_time", day1Ago),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }).gte("snapshot_time", day7Ago),
    supabase.from("inventory_snapshots").select("snapshot_time").gte("snapshot_time", day1Ago),
    supabase.from("data_connections").select("id,source,marketplace,status"),
    supabase.from("data_connections").select("id,source,marketplace,name,status,last_error,last_sync_at,seller_id,sellers(email)")
      .eq("status", "error").order("last_sync_at", { ascending: false }).limit(20),
  ]);

  // Hourly distribution за 24ч
  const hourly: { hour: number; count: number }[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const row of (snapshots1dRows ?? []) as any[]) {
    const h = new Date(row.snapshot_time).getHours();
    hourly[h].count++;
  }

  // Source breakdown
  const sourceBreakdown: Record<string, { total: number; active: number; error: number }> = {};
  for (const c of (connectionsBySource ?? []) as any[]) {
    const key = c.marketplace || c.source || "other";
    if (!sourceBreakdown[key]) sourceBreakdown[key] = { total: 0, active: 0, error: 0 };
    sourceBreakdown[key].total++;
    if (c.status === "active") sourceBreakdown[key].active++;
    if (c.status === "error")  sourceBreakdown[key].error++;
  }

  // Overall health score
  const total = connectionsTotal ?? 0;
  const healthScore = total > 0 ? Math.round(((connectionsActive ?? 0) / total) * 100) : 100;

  return (
    <div className="space-y-8 md:space-y-10">
      <header>
        <div className="inline-flex items-center gap-2">
          <span className="size-1 rounded-full bg-orange" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-orange font-semibold">Admin / Health</span>
        </div>
        <h1 className="mt-2 font-display text-3xl md:text-4xl tracking-tight font-medium">Здоровье системы</h1>
        <p className="mt-1.5 text-ink-muted text-sm">Синхронизация, ошибки, производительность pipeline</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 rounded-2xl border border-line bg-paper p-6 relative">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush mb-2">Pipeline Health</div>
          <div className="relative">
            <HealthRadial value={healthScore} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="font-display text-4xl font-medium tabular text-ink">{healthScore}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">/ 100</div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          <StatusCard label="Активных"     value={connectionsActive ?? 0} tone="good" />
          <StatusCard label="Ошибка"        value={connectionsError ?? 0}  tone={connectionsError ? "bad" : "neutral"} />
          <StatusCard label="Простаивают" value={connectionsIdle ?? 0}   tone={connectionsIdle ? "warn" : "neutral"} />
          <StatusCard label="Всего"         value={connectionsTotal ?? 0}  tone="neutral" />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-line bg-paper p-5 md:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush mb-3">Snapshots · 24 часа</div>
          <div className="flex items-baseline gap-3 mb-4">
            <div className="font-display text-3xl md:text-4xl tabular font-medium text-ink">{snapshots1d ?? 0}</div>
            <div className="font-mono text-[11px] text-ink-hush">/ {snapshots7d ?? 0} за 7 дней</div>
          </div>
          <HourlyHeatmap data={hourly} />
          <p className="mt-3 font-mono text-[10px] text-ink-hush">часы 00——6723 UTC, интенсивность по количеству snapshots</p>
        </div>

        <div className="rounded-2xl border border-line bg-paper p-5 md:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush mb-3">Источники данных</div>
          <div className="space-y-3">
            {Object.entries(sourceBreakdown).length === 0 ? (
              <div className="text-sm text-ink-hush font-mono">Нет подключённых источников</div>
            ) : Object.entries(sourceBreakdown).map(([src, stats]) => {
              const errPct = stats.total > 0 ? (stats.error / stats.total) * 100 : 0;
              const okPct  = stats.total > 0 ? (stats.active / stats.total) * 100 : 0;
              return (
                <div key={src}>
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-display text-base text-ink font-medium uppercase">{src}</span>
                    <span className="font-mono text-[10px] text-ink-hush">{stats.active}/{stats.total}</span>
                  </div>
                  <div className="h-2 rounded-full bg-bg-soft overflow-hidden flex">
                    <div className="h-full bg-lime-deep" style={{ width: `${okPct}%` }} />
                    <div className="h-full bg-rose" style={{ width: `${errPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="size-1 rounded-full bg-rose" />
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-rose font-semibold">Последние ошибки синхронизации</h2>
        </div>
        <div className="rounded-2xl border border-line bg-paper overflow-hidden">
          {(!errorConns || errorConns.length === 0) ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center gap-2 font-mono text-xs text-lime-deep font-semibold">
                <span className="size-1.5 rounded-full bg-lime-deep animate-pulse" />
                всё работает без ошибок
              </div>
            </div>
          ) : errorConns.map((c: any) => {
            const seller = Array.isArray(c.sellers) ? c.sellers[0] : c.sellers;
            return (
              <div key={c.id} className="px-4 md:px-5 py-3 border-b border-line last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink font-medium">{seller?.email || "—"}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-hush">{c.marketplace || c.source} · {c.name}</div>
                    <div className="mt-1 text-xs text-rose" title={c.last_error}>{c.last_error}</div>
                  </div>
                  <div className="font-mono text-[10px] text-ink-hush whitespace-nowrap shrink-0">
                    {c.last_sync_at ? new Date(c.last_sync_at).toLocaleString("ru-RU") : "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" | "neutral" }) {
  const cls = tone === "good"   ? "border-lime-deep/30 bg-lime-soft"
            : tone === "warn"   ? "border-orange/30 bg-orange/10"
            : tone === "bad"    ? "border-rose/30 bg-rose/10"
            :                     "border-line bg-paper";
  const valueColor = tone === "good" ? "text-lime-deep" : tone === "warn" ? "text-orange" : tone === "bad" ? "text-rose" : "text-ink";
  return (
    <div className={`rounded-2xl border p-4 md:p-5 ${cls}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">{label}</div>
      <div className={`mt-1.5 font-display text-2xl md:text-3xl tabular font-medium ${valueColor}`}>{value}</div>
    </div>
  );
}
