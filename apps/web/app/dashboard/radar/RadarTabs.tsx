"use client";
import Link from "next/link";
import type { RadarTab } from "./page";

// Radar v2 (29.05.2026, план Александра): убрали 'early' таб.
// Логика теперь только: new (Wordstat фраза brand+model которой нет в прайсе),
// archived (то же но модель в прайсе или ручной архив), watching (избранное).
const TABS: Array<{ key: RadarTab; label: string; hint: string }> = [
  { key: "new",      label: "Новые",      hint: "Wordstat показывает спрос, у вас этой модели нет — кандидат на закупку" },
  { key: "watching", label: "Наблюдение", hint: "Избранное — отслеживаем для закупки" },
  { key: "archived", label: "Архив",      hint: "Уже продаёте или отклонено вручную" },
];

export default function RadarTabs({
  tab, counts, brandFilter,
}: {
  tab: RadarTab;
  counts: Record<RadarTab, number>;
  brandFilter: string | null;
}) {
  const buildHref = (key: RadarTab) => {
    const params = new URLSearchParams();
    // new — дефолт, в URL не пишем
    if (key !== "new") params.set("tab", key);
    if (brandFilter) params.set("brand", brandFilter);
    const qs = params.toString();
    return `/dashboard/radar${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex items-center gap-1 border-b border-line overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      {TABS.map(t => {
        const active = tab === t.key;
        const count = counts[t.key];
        return (
          <Link
            key={t.key}
            href={buildHref(t.key)}
            title={t.hint}
            className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
              active
                ? "border-lime-deep text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <span>{t.label}</span>
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
              active ? "bg-lime-soft text-lime-deep" : "bg-bg-soft text-ink-hush"
            }`}>
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
