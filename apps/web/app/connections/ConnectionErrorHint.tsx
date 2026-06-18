import Link from "next/link";
import type { ParsedError } from "@/lib/error-parser";
import { t } from "@/lib/i18n";

// Прозрачные (временные) проблемы — мягкая янтарная подсказка, не красная тревога.
// Это «подожди / повтори позже», а не «у тебя всё сломалось».
const TRANSIENT = new Set(["rate_limit", "marketplace_down", "network"]);

const ICON: Record<string, string> = {
  rate_limit: "⏳",
  marketplace_down: "⏳",
  network: "📡",
  auth_failed: "🔑",
  permission: "🔑",
  sku_limit: "📦",
  validation: "✏️",
  unknown: "⚠️",
};

/**
 * Человеческая подсказка вместо сырого текста ошибки синка.
 * Сырой текст прячем под «Технические детали» — для отладки, но не в лицо клиенту.
 * autoRetry: показать строку «повтор произойдёт сам» — только когда бэкенд реально
 * пере-синкнет (временная ошибка и склад не на паузе).
 */
export function ConnectionErrorHint({
  parsed,
  className = "mt-3",
  autoRetry = false,
}: {
  parsed: ParsedError | null;
  className?: string;
  autoRetry?: boolean;
}) {
  if (!parsed) return null;
  const transient = TRANSIENT.has(parsed.kind);
  const box = transient ? "border-orange/30 bg-orange/5" : "border-rose/30 bg-rose/5";
  const titleCls = transient ? "text-orange" : "text-rose";
  const icon = ICON[parsed.kind] ?? "⚠️";

  return (
    <div className={`${className} rounded-xl border p-4 ${box}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-none mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${titleCls}`}>{parsed.title}</div>
          <p className="mt-1 text-sm text-ink-soft">{parsed.message}</p>
          {autoRetry && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-ink-muted">
              <span aria-hidden>↻</span>
              <span>{t("connections.errHint.autoRetry")}</span>
            </p>
          )}
          {parsed.action && (
            <Link
              href={parsed.action.href as any}
              className="mt-2 inline-block text-sm font-semibold text-ink underline hover:no-underline"
            >
              {parsed.action.label} →
            </Link>
          )}
          {parsed.raw && (
            <details className="mt-2 group">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-ink-hush hover:text-ink-muted transition select-none">
                {t("connections.errHint.techDetails")}
              </summary>
              <pre className="mt-2 p-2.5 bg-bg-soft border border-line rounded text-[11px] text-ink-muted font-mono overflow-x-auto whitespace-pre-wrap break-all">
                {parsed.raw}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
