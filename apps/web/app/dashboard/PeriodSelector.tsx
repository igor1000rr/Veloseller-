import Link from "next/link";

const PERIODS = [
  { value: "7",  label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "3 месяца" },
];

export function PeriodSelector({ current, basePath = "/dashboard" }: { current: string; basePath?: string }) {
  return (
    <div className="flex gap-1">
      {PERIODS.map(p => (
        <Link
          key={p.value}
          href={`${basePath}?period=${p.value}` as any}
          className={`text-xs px-3 py-1.5 rounded-lg border transition ${
            current === p.value
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
          }`}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
