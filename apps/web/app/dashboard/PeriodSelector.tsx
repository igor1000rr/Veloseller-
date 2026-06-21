import Link from "next/link";

const PERIODS = [
  { value: "7",  label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "3 месяца" },
];

/**
 * Селектор периода 7/30/90 для дашборда.
 *
 * Mobile-friendly: приведена палитра к ремским токенам (был slate-900),
 * добавлен min-h-[32px] для тач-таргета, whitespace-nowrap на чипах.
 */
export function PeriodSelector({ current, basePath = "/dashboard" }: { current: string; basePath?: string }) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-line bg-paper p-1">
      {PERIODS.map(p => (
        <Link
          key={p.value}
          href={`${basePath}?period=${p.value}`}
          className={`text-xs px-3 py-1.5 rounded-md font-medium transition whitespace-nowrap min-h-[32px] inline-flex items-center ${
            current === p.value
              ? "bg-ink text-paper"
              : "text-ink-muted hover:text-ink hover:bg-bg-soft"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
