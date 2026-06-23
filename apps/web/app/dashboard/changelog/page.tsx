import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../_components/Icons";
import { warehouseKindLabel } from "@/lib/warehouse";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Журнал синхронизаций (правка 13 Александра).
 * Сжато до уровня sync-job'ов вместо per-SKU событий.
 *
 * Mobile-friendly: карточки складов в одной колонке на мобиле, таблица в overflow-x-auto.
 *
 * 01.06.2026 (баг от Александра): счётчик SKU показывал 1000 вместо 1883,
 * и в истории была видна только одна строка (FBS) хотя FBO синхронизирован тоже.
 *
 * Root cause: клиент тянул inventory_snapshots с .limit(20_000) и группировал
 * в JS. Реально за 14 дней у Александра 41 165 строк (1883 SKU × 2 склада × 11 дней).
 * Supabase PostgREST применяет hard limit 1000 строк по умолчанию — поэтому
 * вместо 20K получалось 1000, и эти 1000 ORDER BY snapshot_time DESC оказывались
 * полностью из одного склада (FBS), FBO в окно не попадал.
 *
 * Фикс: RPC get_sync_log_history делает GROUP BY на стороне БД и возвращает
 * 20 строк (по 2 склада × 10 дней) — никаких лимитов не достигаем.
 */
type StatusKind = "synced" | "syncing" | "error" | "paused" | "stale";

const STATUS_META: Record<StatusKind, { label: string; cls: string; dot: string }> = {
  synced:  { label: t("changelog.status.synced"), cls: "text-lime-deep bg-lime-soft border-lime-deep/30", dot: "#84cc16" },
  syncing: { label: t("changelog.status.syncing"),    cls: "text-azure bg-azure/10 border-azure/30",          dot: "#0284c7" },
  error:   { label: t("changelog.status.error"),           cls: "text-rose bg-rose/10 border-rose/30",            dot: "#e11d48" },
  paused:  { label: t("changelog.status.paused"),         cls: "text-ink-soft bg-bg-soft border-line",            dot: "#94a3b8" },
  stale:   { label: t("changelog.status.stale"),    cls: "text-orange bg-orange/10 border-orange/30",       dot: "#ea580c" },
};

function classifyStatus(conn: { status: string | null; last_error: string | null; last_sync_at: string | null }): StatusKind {
  if (conn.status === "syncing") return "syncing";
  if (conn.status === "paused" || conn.status === "disabled") return "paused";
  if (conn.last_error) return "error";
  if (conn.last_sync_at) {
    const hoursAgo = (Date.now() - new Date(conn.last_sync_at).getTime()) / 3_600_000;
    if (hoursAgo > 12) return "stale";
    return "synced";
  }
  return "paused";
}

type SyncHistoryRow = {
  sync_date: string;
  connection_id: string;
  snapshots_count: number;
  last_snapshot_time: string;
};

export default async function ChangelogPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: connections } = await supabase
    .from("data_connections")
    .select("id,name,warehouse_kind,status,last_sync_at,last_error,failure_count")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: true });

  // Журнал за 14 дней — агрегат на уровне БД через RPC get_sync_log_history.
  // Раньше тянули inventory_snapshots с лимитом 20_000 и группировали в JS,
  // но PostgREST срезал до 1000 строк → счётчик SKU занижался, и часть складов
  // вообще не отображалась. Теперь BackEnd возвращает сразу готовый агрегат.
  const { data: historyRaw, error: historyErr } = await supabase
    .rpc("get_sync_log_history", { p_seller_id: user.id, p_days: 14 });

  const history: SyncHistoryRow[] = (historyRaw ?? []) as SyncHistoryRow[];

  const connById = new Map((connections ?? []).map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">{t("changelog.eyebrow")}</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink">{t("changelog.title")}</h1>
          <p className="text-sm text-ink-muted mt-1">{t("changelog.subtitle")}</p>
        </div>
      </header>

      {(!connections || connections.length === 0) ? (
        <div className="rounded-2xl border border-line bg-paper p-8 md:p-14 text-center">
          <p className="font-display text-xl text-ink font-medium">{t("changelog.empty.title")}</p>
          <p className="mt-2 text-sm text-ink-muted max-w-md mx-auto">{t("changelog.empty.text")}</p>
          <Link
            href={"/connections/new"}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-ink text-paper px-5 py-3 text-sm font-semibold hover:bg-ink-soft transition"
          >
            {t("changelog.empty.btn")} <Icons.ArrowRight />
          </Link>
        </div>
      ) : (
        <>
          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">{t("changelog.nowHeading")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {connections.map((c) => {
                const st = classifyStatus(c);
                const meta = STATUS_META[st];
                const hoursAgo = c.last_sync_at
                  ? Math.round((Date.now() - new Date(c.last_sync_at).getTime()) / 3_600_000)
                  : null;
                return (
                  <div key={c.id} className="rounded-2xl border border-line bg-paper p-4">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0 flex-1">
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
                        ? t("changelog.lastSync.never")
                        : hoursAgo < 1
                          ? t("changelog.lastSync.lessHour")
                          : hoursAgo < 24
                            ? t("changelog.lastSync.hours", { n: hoursAgo })
                            : t("changelog.lastSync.days", { n: Math.floor(hoursAgo / 24) })
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

          <div>
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold mb-3">{t("changelog.histHeading")}</h2>
            {historyErr ? (
              <div className="rounded-2xl border border-rose/30 bg-rose/5 p-6 text-sm text-rose font-mono">
                {t("changelog.histError")} {historyErr.message}
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-2xl border border-line bg-paper p-8 md:p-10 text-center text-sm text-ink-muted">
                {t("changelog.histEmpty")}
              </div>
            ) : (
              /* overflow-x-auto обязателен — 5 колонок на 360px экране не помещаются */
              <div className="rounded-2xl border border-line bg-paper overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-bg-soft border-b border-line">
                    <tr>
                      <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("changelog.col.date")}</th>
                      <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("changelog.col.warehouse")}</th>
                      <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold hidden sm:table-cell">{t("changelog.col.type")}</th>
                      <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("changelog.col.status")}</th>
                      <th className="text-right px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("changelog.col.sku")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {history.map(row => {
                      const conn = connById.get(row.connection_id);
                      if (!conn) return null;
                      return (
                        <tr key={`${row.sync_date}_${row.connection_id}`} className="hover:bg-bg-soft/40 transition">
                          <td className="px-3 sm:px-4 py-2.5 font-mono text-xs text-ink-soft whitespace-nowrap">
                            {new Date(row.sync_date).toLocaleDateString("ru-RU")}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5">
                            <div className="text-ink-soft font-medium">{conn.name}</div>
                            {/* На мобиле тип показываем под названием, потому что отдельный столбец hidden sm:table-cell */}
                            <div className="sm:hidden font-mono text-[10px] uppercase tracking-widest text-ink-hush mt-0.5">
                              {warehouseKindLabel(conn.warehouse_kind)}
                            </div>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-ink-hush hidden sm:table-cell">
                            {warehouseKindLabel(conn.warehouse_kind)}
                          </td>
                          <td className="px-3 sm:px-4 py-2.5">
                            <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${STATUS_META.synced.cls}`}>
                              {STATUS_META.synced.label}
                            </span>
                          </td>
                          <td className="px-3 sm:px-4 py-2.5 text-right tabular text-xs text-ink-muted">{row.snapshots_count}</td>
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
