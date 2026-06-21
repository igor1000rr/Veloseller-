import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
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
    { count: connectionsPaused },
    { count: snapshots1d },
    { count: snapshots7d },
    { data: snapshots1dRows },
    { data: connectionsBySource },
    { data: errorConns },
    { data: connectionsAge },
    { data: onboardingHealth },
  ] = await Promise.all([
    supabase.from("data_connections").select("id", { count: "exact", head: true }),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "error"),
    supabase.from("data_connections").select("id", { count: "exact", head: true }).eq("status", "paused"),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }).gte("snapshot_time", day1Ago),
    supabase.from("inventory_snapshots").select("snapshot_id", { count: "exact", head: true }).gte("snapshot_time", day7Ago),
    supabase.from("inventory_snapshots").select("snapshot_time").gte("snapshot_time", day1Ago),
    supabase.from("data_connections").select("id,source,marketplace,status"),
    supabase.from("data_connections").select("id,source,marketplace,name,status,last_error,last_sync_at,seller_id,sellers(email)")
      .eq("status", "error").order("last_sync_at", { ascending: false }).limit(20),
    supabase.rpc("admin_connection_data_age"),
    supabase.rpc("admin_auth_onboarding_health"),
  ]);

  // Hourly distribution за 24ч
  const hourly: { hour: number; count: number }[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const row of (snapshots1dRows ?? []) as any[]) {
    const h = new Date(row.snapshot_time).getUTCHours();
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

  // Здоровье онбординга: триггер sellers на месте + нет осиротевших юзеров (auth.users без sellers).
  const onboarding = (Array.isArray(onboardingHealth) ? onboardingHealth[0] : onboardingHealth) as { trigger_present?: boolean; orphan_count?: number } | null | undefined;
  const onboardingOk = !!onboarding?.trigger_present && Number(onboarding?.orphan_count ?? 0) === 0;

  // Stale connections: 24h+ без sync (или sync вообще не было)
  const connAge = (connectionsAge ?? []) as any[];
  const staleConnections = connAge.filter(c =>
    c.hours_since_last_sync == null || Number(c.hours_since_last_sync) > 24
  );
  const youngHistory = connAge.filter(c => c.days_of_history < 14 && c.status === "active");

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

      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${onboardingOk ? "border-lime-deep/30 bg-lime-soft" : "border-rose/40 bg-rose/10"}`}>
        <div className="flex items-center gap-2.5">
          <span className={`size-1.5 rounded-full ${onboardingOk ? "bg-lime-deep" : "bg-rose animate-pulse"}`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush font-semibold">Онбординг</span>
        </div>
        <div className="font-mono text-[11px]">
          {onboardingOk ? (
            <span className="text-lime-deep">триггер sellers активен · сирот 0</span>
          ) : (
            <span className="text-rose">
              {onboarding?.trigger_present ? "" : "триггер on_auth_user_created пропал · "}
              сирот без sellers: {Number(onboarding?.orphan_count ?? 0)} · авто-хил поднимет ≤15 мин
            </span>
          )}
        </div>
      </div>

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
          <StatusCard label="На паузе"     value={connectionsPaused ?? 0} tone={connectionsPaused ? "warn" : "neutral"} />
          <StatusCard label="Всего"         value={connectionsTotal ?? 0}  tone="neutral" />
        </div>
      </section>

      {/* Возраст данных — главный новый раздел.
          Stale > 24h sync и младше 14 дней истории — рискованные склады */}
      {connAge.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="size-1 rounded-full bg-azure" />
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-azure font-semibold">
                Возраст данных по складам
              </h2>
            </div>
            <div className="font-mono text-[10px] text-ink-hush">
              {staleConnections.length > 0 && (
                <span className="text-rose mr-3">{staleConnections.length} зависших</span>
              )}
              {youngHistory.length > 0 && (
                <span className="text-orange">{youngHistory.length} новых (&lt;14д)</span>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-paper overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-soft border-b border-line">
                  <tr>
                    <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                      Склад
                    </th>
                    <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                      Селлер
                    </th>
                    <th className="text-center px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                      Статус
                    </th>
                    <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                      История
                    </th>
                    <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                      Snapshots
                    </th>
                    <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                      Последний sync
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {connAge.map(row => (
                    <ConnectionAgeRow key={row.connection_id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-2 font-mono text-[10px] text-ink-hush">
            Красный — sync &gt; 24ч или меньше 7 дней истории · Жёлтый — sync &gt; 12ч или 7-14 дней истории
          </p>
        </section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-line bg-paper p-5 md:p-6">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush mb-3">Snapshots · 24 часа</div>
          <div className="flex items-baseline gap-3 mb-4">
            <div className="font-display text-3xl md:text-4xl tabular font-medium text-ink">{snapshots1d ?? 0}</div>
            <div className="font-mono text-[11px] text-ink-hush">/ {snapshots7d ?? 0} за 7 дней</div>
          </div>
          <HourlyHeatmap data={hourly} />
          <p className="mt-3 font-mono text-[10px] text-ink-hush">часы 00–23 UTC, интенсивность по количеству snapshots</p>
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
                    <Link href={`/admin/sellers/${c.seller_id}`} className="text-sm text-ink font-medium hover:text-lime-deep transition">
                      {seller?.email || "—"}
                    </Link>
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

function ConnectionAgeRow({ row }: { row: any }) {
  const hours = row.hours_since_last_sync == null ? null : Number(row.hours_since_last_sync);
  const days = Number(row.days_of_history ?? 0);
  const snapshotsCount = Number(row.snapshots_count ?? 0);

  // Цветовая индикация для последнего sync
  const syncTone =
    hours == null ? "bad"      // нет sync вообще = красный
    : hours > 24 ? "bad"        // > 24ч = красный
    : hours > 12 ? "warn"       // > 12ч = жёлтый
    : "good";                   // < 12ч = зелёный
  const syncColor = {
    good: "text-lime-deep",
    warn: "text-orange",
    bad:  "text-rose",
  }[syncTone];

  // Цветовая индикация для возраста истории
  const histTone =
    days < 7 ? "bad"
    : days < 14 ? "warn"
    : "good";
  const histColor = {
    good: "text-ink",
    warn: "text-orange",
    bad:  "text-rose",
  }[histTone];

  const syncLabel =
    hours == null ? "никогда"
    : hours < 1 ? `${Math.round(hours * 60)} мин назад`
    : hours < 24 ? `${Math.round(hours)} ч назад`
    : `${Math.floor(hours / 24)} д назад`;

  const statusColor =
    row.status === "active" ? "text-lime-deep"
    : row.status === "error" ? "text-rose"
    : "text-ink-hush";

  return (
    <tr className="border-b border-line last:border-0 hover:bg-bg-soft/40 transition">
      <td className="px-4 py-3 text-ink text-xs">
        <div className="truncate max-w-[180px]" title={row.connection_name}>
          {row.connection_name || "—"}
        </div>
        <div className="mt-0.5 font-mono text-[9px] uppercase text-ink-hush">
          {row.marketplace || row.source}
        </div>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/admin/sellers/${row.seller_id}`}
          className="text-ink text-xs hover:text-lime-deep transition truncate inline-block max-w-[220px]"
          title={row.seller_email}
        >
          {row.seller_email || "—"}
        </Link>
      </td>
      <td className="px-4 py-3 text-center">
        <span className={`font-mono text-[10px] uppercase tracking-wider ${statusColor}`}>
          {row.status}
        </span>
      </td>
      <td className={`px-4 py-3 text-right tabular text-xs whitespace-nowrap ${histColor}`}>
        {days} {pluralizeDays(days)}
      </td>
      <td className="px-4 py-3 text-right tabular text-xs text-ink-muted whitespace-nowrap">
        {snapshotsCount.toLocaleString("ru-RU")}
      </td>
      <td className={`px-4 py-3 text-right text-xs whitespace-nowrap ${syncColor}`}>
        {syncLabel}
      </td>
    </tr>
  );
}

function pluralizeDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
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
