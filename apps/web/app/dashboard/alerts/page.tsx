import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Icons } from "../../_components/Icons";
import { InfoTooltip } from "../../_components/InfoTooltip";
import { t } from "@/lib/i18n";
import { LOCALE } from "@/lib/features";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Страница «Отчёты» — этап 2 миграции «алерты → отчёты».
 *
 * Раньше: real-time таблица alerts (kind/SKU/Сообщение), пользователь
 *   нажимал «Принять» на каждом или массово.
 * Теперь: история отправленных Excel-отчётов из таблицы report_history.
 *   Каждая запись = один файл (email или telegram), может содержать
 *   несколько kinds на одну дату.
 *
 * Файлы XLSX пока хранятся только в отправленном email/telegram —
 * Supabase Storage для повторного скачивания будет в этапе 3.
 */

const KIND_LABELS: Record<string, string> = {
  critical_stock:     t("report.kind.criticalStock"),
  low_stock:          t("report.kind.lowStock"),
  dead_inventory:     t("report.kind.deadInventory"),
  repeated_stockout:  t("report.kind.repeatedStockout"),
  underestimated_sku: t("report.kind.underestimatedSku"),
  sync_error:         t("report.kind.syncError"),
  weekly_report:      t("report.kind.weeklyReport"),
};

const KIND_TONE: Record<string, string> = {
  critical_stock:     "text-rose border-rose/30 bg-rose/10",
  low_stock:          "text-orange border-orange/30 bg-orange/10",
  dead_inventory:     "text-ink-soft border-line bg-bg-soft",
  repeated_stockout:  "text-orange border-orange/40 bg-orange/15",
  underestimated_sku: "text-azure border-azure/30 bg-azure/10",
  sync_error:         "text-rose border-rose/40 bg-rose/15",
  weekly_report:      "text-lime-deep border-lime-deep/30 bg-lime-soft",
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  sent:    { label: t("report.status.sent"),    cls: "text-lime-deep border-lime-deep/30 bg-lime-soft" },
  failed:  { label: t("report.status.failed"),  cls: "text-rose border-rose/30 bg-rose/10" },
  skipped: { label: t("report.status.skipped"), cls: "text-ink-hush border-line bg-bg-soft" },
};

type ReportHistoryRow = {
  id: string;
  sent_at: string;
  day_of_week: number;
  kinds: string[];
  channel: "email" | "telegram";
  status: "sent" | "failed" | "skipped";
  sku_counts: Record<string, number>;
  file_name: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
};

const LOC = LOCALE === "ru" ? "ru-RU" : "en-US";

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return "—";
  if (n < 1024) return `${n} ${t("unit.bytes.b")}`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ${t("unit.bytes.kb")}`;
  return `${(n / (1024 * 1024)).toFixed(2)} ${t("unit.bytes.mb")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(LOC, {
    day: "numeric", month: "long", year: "numeric",
    weekday: "long",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" });
}

export default async function ReportsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // История отправленных отчётов — последние 100 за всё время.
  // Группируем визуально по дате (одна дата = один заголовок),
  // но email и telegram отправки за тот же день остаются отдельными карточками.
  const { data: history } = await supabase
    .from("report_history")
    .select("id,sent_at,day_of_week,kinds,channel,status,sku_counts,file_name,file_size_bytes,error_message")
    .eq("seller_id", user.id)
    .order("sent_at", { ascending: false })
    .limit(100);

  const rows = (history ?? []) as ReportHistoryRow[];

  // Активные подписки — чтобы в пустом состоянии показать что настроено.
  const { count: subsCount } = await supabase
    .from("notification_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .eq("enabled", true);

  // Группировка по дате (sent_date) для UI заголовков.
  const groups = new Map<string, ReportHistoryRow[]>();
  for (const r of rows) {
    const dateKey = r.sent_at.slice(0, 10);
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(r);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="size-1 rounded-full bg-lime-deep" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">
              Reports history
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl tracking-tight font-medium text-ink flex items-center flex-wrap">
            <span>{t("report.title")}</span>
            <InfoTooltip text={t("report.titleTip")} />
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            {rows.length > 0
              ? <>{t("report.totalSentLabel")} <strong className="text-ink tabular">{rows.length}</strong></>
              : <>{t("report.emptyHint")}</>
            }
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={"/dashboard/alerts/subscriptions" as any}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-paper text-sm text-ink-muted hover:text-ink hover:bg-bg-soft hover:border-lime-deep/40 transition min-h-[36px]"
          >
            <span aria-hidden="true">⚙</span>
            <span>{t("report.settingsLink")}</span>
            {subsCount != null && subsCount > 0 && (
              <span className="font-mono text-[10px] text-ink-hush">({subsCount})</span>
            )}
          </Link>
        </div>
      </header>

      {rows.length === 0 ? (
        <EmptyState subsCount={subsCount ?? 0} />
      ) : (
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([dateKey, dayRows]) => (
            <div key={dateKey} className="space-y-3">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold border-b border-line pb-2">
                {formatDate(dayRows[0].sent_at)}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {dayRows.map(r => (
                  <ReportCard key={r.id} row={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ subsCount }: { subsCount: number }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-6 sm:p-10 text-center space-y-4">
      <div className="inline-flex items-center justify-center size-14 rounded-full bg-lime-soft text-lime-deep mx-auto">
        <Icons.ArrowRight size={20} />
      </div>
      <div className="space-y-2 max-w-md mx-auto">
        <h2 className="font-display text-xl font-medium text-ink">{t("report.empty.title")}</h2>
        <p className="text-sm text-ink-muted">
          {subsCount > 0
            ? <>{t("report.empty.hasSubsPre")} <b className="text-ink">{subsCount}</b> {t("report.empty.hasSubsPost")}</>
            : <>{t("report.empty.noSubs")}</>
          }
        </p>
      </div>
      <div className="pt-2">
        <Link
          href={"/dashboard/alerts/subscriptions" as any}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-ink text-paper text-sm font-medium hover:bg-ink-soft transition min-h-[40px]"
        >
          {t("report.empty.openSettings")} <Icons.ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

function ReportCard({ row }: { row: ReportHistoryRow }) {
  const status = STATUS_META[row.status] ?? STATUS_META.sent;
  const isFailure = row.status === "failed";
  const isSkipped = row.status === "skipped";

  return (
    <div className={`rounded-2xl border bg-paper p-4 transition ${
      isFailure ? "border-rose/30" : isSkipped ? "border-line opacity-75" : "border-line"
    }`}>
      <div className="flex items-start justify-between gap-2 flex-wrap mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ChannelBadge channel={row.channel} />
          <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${status.cls}`}>
            {status.label}
          </span>
          <span className="font-mono text-[11px] text-ink-hush">
            {formatTime(row.sent_at)}
          </span>
        </div>
        {row.file_size_bytes != null && row.status === "sent" && (
          <span className="font-mono text-[10px] text-ink-hush tabular whitespace-nowrap">
            {formatBytes(row.file_size_bytes)}
          </span>
        )}
      </div>

      {/* Список kinds с количеством SKU */}
      <div className="space-y-1.5">
        {row.kinds.map(kind => {
          const label = KIND_LABELS[kind] ?? kind;
          const tone = KIND_TONE[kind] ?? "text-ink-soft border-line bg-bg-soft";
          const count = row.sku_counts?.[kind] ?? 0;
          return (
            <div key={kind} className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${tone}`}>
                {label}
              </span>
              <span className="font-mono text-xs tabular text-ink-soft">
                {count > 0 ? <>{count} SKU</> : <span className="text-ink-hush">—</span>}
              </span>
            </div>
          );
        })}
      </div>

      {/* Имя файла — только информационное, без download (Storage в TODO) */}
      {row.file_name && row.status === "sent" && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="font-mono text-[11px] text-ink-hush break-all">
            📎 {row.file_name}
          </p>
        </div>
      )}

      {/* Ошибка — раскрытая по умолчанию */}
      {isFailure && row.error_message && (
        <div className="mt-3 pt-3 border-t border-rose/20">
          <p className="font-mono text-[11px] text-rose break-words">
            {row.error_message}
          </p>
        </div>
      )}

      {/* Skipped — короткое объяснение если есть */}
      {isSkipped && row.error_message && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className="font-mono text-[11px] text-ink-hush">
            {row.error_message === "no data"
              ? t("report.skippedNoData")
              : row.error_message}
          </p>
        </div>
      )}
    </div>
  );
}

function ChannelBadge({ channel }: { channel: "email" | "telegram" }) {
  if (channel === "email") {
    return (
      <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold text-azure bg-azure/10 border-azure/30">
        Email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold text-lime-deep bg-lime-soft border-lime-deep/30">
      Telegram
    </span>
  );
}