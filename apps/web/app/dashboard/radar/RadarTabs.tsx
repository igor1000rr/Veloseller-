"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Tab = "early" | "new" | "watching" | "archived";

const TAB_CONFIG: Array<{ key: Tab; label: string; description: string; tone: string }> = [
  {
    key: "new",
    label: "Новые",
    description: "Wordstat + WB/OZON suggest подтверждают",
    tone: "text-lime-deep border-lime-deep",
  },
  {
    key: "early",
    label: "Ранние сигналы",
    description: "Только Wordstat — товара в РФ ещё нет",
    tone: "text-azure border-azure",
  },
  {
    key: "watching",
    label: "Наблюдение",
    description: "Помечено как избранное",
    tone: "text-orange border-orange",
  },
  {
    key: "archived",
    label: "Архив",
    description: "Убрано из выдачи",
    tone: "text-ink-hush border-ink-hush",
  },
];

export function RadarTabs({
  currentTab,
  counts,
}: {
  currentTab: Tab;
  counts: Record<Tab, number>;
}) {
  const sp = useSearchParams();
  const brand = sp.get("brand") ?? "";
  const q = sp.get("q") ?? "";

  const makeHref = (tab: Tab) => {
    const params = new URLSearchParams();
    params.set("tab", tab);
    if (brand) params.set("brand", brand);
    if (q) params.set("q", q);
    return `/dashboard/radar?${params.toString()}`;
  };

  return (
    <div className="border-b border-line">
      <div className="flex gap-1 overflow-x-auto -mb-px">
        {TAB_CONFIG.map((t) => {
          const active = t.key === currentTab;
          const count = counts[t.key] ?? 0;
          return (
            <Link
              key={t.key}
              href={makeHref(t.key) as any}
              className={`shrink-0 px-4 py-3 border-b-2 transition group ${
                active
                  ? `${t.tone} bg-bg-soft/50`
                  : "border-transparent text-ink-muted hover:text-ink hover:bg-bg-soft/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{t.label}</span>
                <span className={`inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 text-[11px] font-mono font-semibold rounded ${
                  active ? "bg-paper text-ink border border-line" : "bg-bg-soft text-ink-muted"
                }`}>
                  {count}
                </span>
              </div>
              <div className="text-[11px] text-ink-hush mt-0.5 hidden sm:block">
                {t.description}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
