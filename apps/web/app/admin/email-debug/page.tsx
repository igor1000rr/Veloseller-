import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendTestEmail } from "./actions";
import { TestEmailForm } from "./TestEmailForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Админка: диагностика email-отправки (Resend).
 *
 * Показывает:
 *  — статус env-переменных (set/unset, без самих секретов)
 *  — последние 30 записей report_history (в том числе failed с error_message)
 *  — кнопка «Отправить тестовый email» через тот же Resend SDK
 *  — подписки и sellers для контекста
 *
 * Доступ проверяется layout.tsx через ADMIN_EMAILS.
 */

async function fetchHistory() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("report_history")
    .select("id,sent_at,seller_id,channel,status,kinds,file_size_bytes,error_message,storage_path")
    .order("sent_at", { ascending: false })
    .limit(30);
  return data ?? [];
}

async function fetchSubsCount() {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("notification_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true);
  return count ?? 0;
}

function EnvRow({ name, value, kind }: { name: string; value: string; kind: "ok" | "warn" | "err" }) {
  const tone =
    kind === "ok" ? "text-lime-deep bg-lime-soft border-lime-deep/30" :
    kind === "warn" ? "text-orange bg-orange/10 border-orange/30" :
    "text-rose bg-rose/10 border-rose/30";
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-line last:border-b-0">
      <code className="font-mono text-xs text-ink-soft">{name}</code>
      <span className={`font-mono text-[11px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold ${tone}`}>
        {value}
      </span>
    </div>
  );
}

export default async function EmailDebugPage() {
  // env читаем на сервере, никогда не отдаём сами секреты клиенту.
  const resendKey = process.env.RESEND_API_KEY ?? "";
  const resendFrom = process.env.RESEND_FROM ?? "";
  const appUrl = process.env.APP_URL ?? "";
  const adminEmails = process.env.ADMIN_EMAILS ?? "";

  const [history, subsCount] = await Promise.all([
    fetchHistory(),
    fetchSubsCount(),
  ]);

  const failedCount = history.filter(h => h.status === "failed").length;
  const sentCount = history.filter(h => h.status === "sent").length;
  const skippedCount = history.filter(h => h.status === "skipped").length;

  return (
    <div className="space-y-6">
      <header>
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="size-1 rounded-full bg-rose" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-rose font-semibold">
            Admin · Email debug
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl tracking-tight font-medium text-ink">
          Диагностика почты
        </h1>
        <p className="text-ink-muted text-sm mt-1">
          Настройки Resend, история отправок, тестовый email.
        </p>
      </header>

      {/* ENV */}
      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-display text-lg font-medium text-ink mb-3">Environment</h2>
        <div className="space-y-0">
          <EnvRow
            name="RESEND_API_KEY"
            value={resendKey ? `set (${resendKey.length} симв.)` : "НЕ ЗАДАН"}
            kind={resendKey ? "ok" : "err"}
          />
          <EnvRow
            name="RESEND_FROM"
            value={resendFrom || "не задан (будет дефолт noreply@veloseller.ru)"}
            kind={resendFrom ? "ok" : "warn"}
          />
          <EnvRow
            name="APP_URL"
            value={appUrl || "не задан (дефолт https://veloseller.ru)"}
            kind={appUrl ? "ok" : "warn"}
          />
          <EnvRow
            name="ADMIN_EMAILS"
            value={adminEmails ? `${adminEmails.split(",").length} админ(ов)` : "не задан"}
            kind={adminEmails ? "ok" : "warn"}
          />
        </div>
        {!resendKey && (
          <p className="mt-4 text-sm text-rose">
            ⚠ RESEND_API_KEY не задан — это основная причина почему почта не работает.
            Добавьте в <code className="font-mono text-xs bg-bg-soft px-1">apps/web/.env.production</code> (и в worker&apos;е).
          </p>
        )}
      </section>

      {/* Сводка */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Подписок (enabled)" value={subsCount} tone="azure" />
        <Stat label="Отправлено" value={sentCount} tone="lime" />
        <Stat label="Ошибок" value={failedCount} tone="rose" />
        <Stat label="Пропущено" value={skippedCount} tone="ink" />
      </section>

      {/* Тестовый email */}
      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-display text-lg font-medium text-ink mb-1">Тестовый email</h2>
        <p className="text-sm text-ink-muted mb-4">
          Отправит письмо через Resend и покажет результат. Полезно чтобы проверить ключ, домен, доставку.
        </p>
        <TestEmailForm action={sendTestEmail} />
      </section>

      {/* История */}
      <section className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
        <h2 className="font-display text-lg font-medium text-ink mb-3">
          Последние 30 отправок
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted py-4 text-center">Истории пока нет — cron ещё не бежал.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-hush font-mono text-[10px] uppercase tracking-widest border-b border-line">
                  <th className="py-2 px-3 font-semibold">Время</th>
                  <th className="py-2 px-3 font-semibold">Seller</th>
                  <th className="py-2 px-3 font-semibold">Канал</th>
                  <th className="py-2 px-3 font-semibold">Статус</th>
                  <th className="py-2 px-3 font-semibold">Kinds</th>
                  <th className="py-2 px-3 font-semibold">Ошибка</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} className="border-b border-line last:border-b-0">
                    <td className="py-2 px-3 font-mono text-[11px] text-ink-soft whitespace-nowrap">
                      {new Date(h.sent_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-ink-hush">
                      {h.seller_id.slice(0, 8)}…
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-ink-soft">{h.channel}</td>
                    <td className="py-2 px-3">
                      <StatusBadge status={h.status} />
                    </td>
                    <td className="py-2 px-3 font-mono text-[10px] text-ink-soft">
                      {(h.kinds ?? []).join(", ") || "—"}
                    </td>
                    <td className="py-2 px-3 font-mono text-[10px] text-rose break-words max-w-[280px]">
                      {h.error_message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "azure" | "lime" | "rose" | "ink" }) {
  const cls = {
    azure: "border-azure/30 bg-azure/5 text-azure",
    lime: "border-lime-deep/30 bg-lime-soft text-lime-deep",
    rose: "border-rose/30 bg-rose/10 text-rose",
    ink: "border-line bg-bg-soft text-ink-soft",
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="font-mono text-[10px] uppercase tracking-widest font-semibold mb-1 opacity-70">{label}</div>
      <div className="font-display text-2xl font-medium tabular">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; cls: string }> = {
    sent:    { label: "Отправлен", cls: "text-lime-deep bg-lime-soft border-lime-deep/30" },
    failed:  { label: "Ошибка", cls: "text-rose bg-rose/10 border-rose/30" },
    skipped: { label: "Пропущен", cls: "text-ink-hush bg-bg-soft border-line" },
  };
  const m = meta[status] ?? meta.sent;
  return (
    <span className={`inline-flex items-center font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 rounded border font-semibold whitespace-nowrap ${m.cls}`}>
      {m.label}
    </span>
  );
}
