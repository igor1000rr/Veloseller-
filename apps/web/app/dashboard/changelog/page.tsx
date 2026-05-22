import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../_components/Icons";
import { warehouseKindLabel } from "@/lib/warehouse";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Журнал синхронизаций (правка 13 Александра).
 *
 * Раньше показывал per-SKU события (продажа/пополнение/аномалия) — оказалось
 * слишком "мусорно" для пользователя. Теперь сжато до уровня sync-job'ов:
 * "Дата / Склад / Статус". Юзеру важно знать что синхронизация прошла,
 * а не разбирать каждое движение по каждому SKU.
 *
 * Источник данных:
 *   data_connections — текущий статус каждого склада (last_sync_at, status, last_error)
 *   inventory_snapshots — историческая дата по каждому складу (max snapshot_time
 *   по дню × connection_id)
 *
 * Сначала показываем "live" статус по каждому складу (что прямо сейчас),
 * потом — историю синков за последние 14 дней.
 */
type StatusKind = "synced" | "syncing" | "error" | "paused" | "stale";

const STATUS_META: Record<StatusKind, { label: string; cls: string; dot: string }> = {
  synced:  { label: "Синхронизировано", cls: "text-lime-deep bg-lime-soft border-lime-deep/30", dot: "#84cc16" },
  syncing: { label: "Синхронизация",    cls: "text-azure bg-azure/10 border-azure/30",          dot: "#0284c7" },
  error:   { label: "Ошибка",           cls: "text-rose bg-rose/10 border-rose/30",            dot: "#e11d48" },
  paused:  { label: "На паузе",         cls: "text-ink-soft bg-bg-soft border-line",            dot: "#94a3b8" },
  stale:   { label: "Давно не было",    cls: "text-orange bg-orange/10 border-orange/30",       dot: "#ea580c" },
};

function classifyStatus(conn: any): StatusKind {
  if (conn.status === "syncing") return "syncing";
  if (conn.status === "paused" || conn.status === "disabled") return "paused";
  if (conn.last_error) return "error";
  if (conn.last_sync_at) {
    const hoursAgo = (Date.now() - new Date(conn.last_sync_at).getTime()) / 3_600_000;
    if (hoursAgo > 12) return "stale";  // последний синк > 12ч назад
    return "synced";
  }
  return "paused";
}

export default async function ChangelogPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Live-статус по каждому подключённому складу
  const { data: connections } = await supabase
    .from("data_connections")
    .select("id,name,warehouse_kind,status,last_sync_at,last_error,failure_count")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: true });

  // История синков: считаем кол-во snapshots по дню × connection_id.
  // Берём за последние 14 дней — на UI вместимо, и за этот период обычно
  // видна вся картина (что сломалось, когда стало синкаться снова).
  const fortnightAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data: snapshotRows } = await supabase
    .from("inventory_snapshots")
    .select("snapshot_time,products!inner(connection_id,seller_id)")
    .eq("products.seller_id", user.id)
    .gte("snapshot_time", fortnightAgo)
    .order("snapshot_time", { ascending: false })
    .limit(20_000);

  // Группируем snapshot'ы по (date × connection_id) → одна запись синка в день
  type SyncDayRow = { date: string; connectionId: string; count: number; lastTime: string };
  const syncMap = new Map<string, SyncDayRow>();
  for (const row of snapshotRows ?? []) {
    const r = row as any;
    const product = Array.isArray(r.products) ? r.products[0] : r.products;
    if (!product?.connection_id) continue;
    const date = r.snapshot_time.slice(0, 10);  // YYYY-MM-DD
    const key = `${date}__${product.connection_id}`;
    const existing = syncMap.get(key);
    if (existing) {
      existing.count += 1;
      if (r.snapshot_time > existing.lastTime) existing.lastTime = r.snapshot_time;
    } else {
      syncMap.set(key, { date, connectionId: product.connection_id, count: 1, lastTime: r.snapshot_time });
    }
  }

  const connById = new Map((connections ?? []).map((c: any) => [c.id, c]));
  const history = Array.from(syncMap.values())
    .sort((a, b) => b.lastTime.localeCompare(a.lastTime));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">Sync log</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight font-medium text-ink">Журнал синхронизаций</h1>
          <p className="text-sm text-ink-muted mt-1">Когда и с каких складов мы получали данные за последние 14 дней.</p>
        </div>
      </header>

      {(!connections || connections.length === 0) ? (
        <div className="rounded-2xl border border-line bg-paper p-10 md:p-14 text-center">
          <p className="font-display text-xl text-ink font-medium">Нет подключённых складов</p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">
            После подключения первого склада здесь появится журнал синхронизаций.
          </p>
          <Link
            href={"/connections/new" as any}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition"
          >
            Подключить склад <Icons.ArrowRight />
          </Link>
        </div>
      ) : (
        <>
          {/* Live-статус — карточки по каждому складу */}
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">
              Сейчас по складам
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {connections.map((c: any) => {
                const st = classifyStatus(c);
                const meta = STATUS_META[st];
                const hoursAgo = c.last_sync_at
                  ? Math.round((Date.now() - new Date(c.last_sync_at).getTime()) / 3_600_000)
                  : null;
                return (
                  <div key={c.id} className="rounded-2xl border border-line bg-paper p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-ink truncate">{c.name}</div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush mt-0.5">
                          {warehouseKindLabel(c.warehouse_kind)}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold shrink-0 ${meta.cls}`}>
                        <span className="size-1.5 rounded-full" style={{ background: meta.dot }} />
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-3 text-xs text-ink-muted">
                      {hoursAgo == null
                        ? "Ещё не синхронизировался"
                        : hoursAgo < 1
                          ? "Синхронизирован < часа назад"
                          : hoursAgo < 24
                            ? `Синхронизирован ${hoursAgo}ч назад`
                            : `Синхронизирован ${Math.floor(hoursAgo / 24)}д назад`
                      }
                    </div>
                    {c.last_error && (
                      <div className="mt-2 p-2 rounded bg-rose/5 border border-rose/20 text-[11px] text-rose font-mono break-words">
                        {String(c.last_error).slice(0, 200)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Историческая таблица: дата × склад → количество snapshot'ов в этот день */}
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">
              История за 14 дней
            </h2>
            {history.length === 0 ? (
              <div className="rounded-2xl border border-line bg-paper p-10 text-center text-sm text-ink-muted">
                За последние 14 дней нет данных по synapshots.
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-paper overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-bg-soft border-b border-line">
                    <tr>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Дата</th>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Склад</th>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Тип</th>
                      <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Статус</th>
                      <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">SKU обработано</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.map(row => {
                      const conn = connById.get(row.connectionId) as any;
                      if (!conn) return null;
                      return (
                        <tr key={`${row.date}_${row.connectionId}`} className="hover:bg-bg-soft/40 transition">
                          <td className="px-4 py-2.5 font-mono text-xs text-ink-soft whitespace-nowrap">
                            {new Date(row.date).toLocaleDateString("ru-RU")}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-ink-soft font-medium">{conn.name}</div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-ink-hush">
                            {warehouseKindLabel(conn.warehouse_kind)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${STATUS_META.synced.cls}`}>
                              {STATUS_META.synced.label}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular text-xs text-ink-muted">{row.count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
