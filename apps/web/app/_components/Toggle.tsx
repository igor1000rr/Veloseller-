"use client";

/**
 * Переключатель (switch) уведомлений — общий для /account и /dashboard/settings.
 * type="button" обязателен: внутри <form> кнопка без type сабмитит форму.
 */
export function Toggle({ label, description, checked, disabled, onChange }: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        {description && <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-lime-deep/40 ${
          checked ? "bg-lime-deep" : "bg-bg-soft border border-line"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-paper shadow transition ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
