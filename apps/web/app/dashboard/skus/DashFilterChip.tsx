"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { InfoTooltip } from "../../_components/InfoTooltip";

/**
 * Активный чип фильтра с обзора (правка 8 Александра):
 * "Он тут же может поменять фильтр низкого остатка с менее 3 до менее 10".
 *
 * Показывается когда есть ?filter=<dashFilter>&period=<period>. Юзер видит
 * описание фильтра + редактируемый порог. При смене порога — апдейт URL
 * через router.replace с debounce 500мс, страница перерисуется на сервере.
 *
 * Поддерживаемые фильтры с регулируемым порогом:
 * - low_stock: порог coverage_days (default 7)
 * - dead_inventory: порог coverage_days (default 180)
 *
 * Для lost_revenue, oos, inactive порог не нужен — фильтр булевый.
 */

type DashFilter = "low_stock" | "lost_revenue" | "dead_inventory" | "oos" | "inactive";

const FILTER_LABELS: Record<DashFilter, string> = {
  low_stock:      "Низкий остаток",
  lost_revenue:   "Потерянная выручка",
  dead_inventory: "Неликвид",
  oos:            "Нет в наличии",
  inactive:       "SKU без активности",
};

const FILTER_DESCRIPTIONS: Record<DashFilter, (threshold: number) => string> = {
  low_stock:      (t) => `покрытие ≤ ${t} дней`,
  lost_revenue:   () => "была недополучка из-за OOS",
  dead_inventory: (t) => `покрытие > ${t} дней`,
  oos:            () => "активные SKU (с движением за 30 дней)",
  inactive:       () => "0 остаток + нет движений",
};

// Поддерживает ли фильтр редактируемый порог
function hasThreshold(filter: DashFilter): boolean {
  return filter === "low_stock" || filter === "dead_inventory";
}

function defaultThreshold(filter: DashFilter): number {
  if (filter === "low_stock") return 7;
  if (filter === "dead_inventory") return 180;
  return 0;
}

export function DashFilterChip({ filter, periodDays, threshold, segmentFilter }: {
  filter: DashFilter;
  periodDays: number;
  threshold: number | null;
  segmentFilter: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Локальное состояние порога — для удобной типизации в input
  const initialThreshold = threshold ?? defaultThreshold(filter);
  const [localThreshold, setLocalThreshold] = useState(String(initialThreshold));

  // Синхронизация при изменении URL извне (back-button и т.п.)
  useEffect(() => {
    setLocalThreshold(String(threshold ?? defaultThreshold(filter)));
  }, [threshold, filter]);

  function applyThreshold(newValue: string) {
    const n = parseInt(newValue, 10);
    if (!Number.isFinite(n) || n < 1) return;
    const params = new URLSearchParams(sp.toString());
    if (n === defaultThreshold(filter)) {
      params.delete("threshold");
    } else {
      params.set("threshold", String(n));
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}` as any);
  }

  const currentThreshold = threshold ?? defaultThreshold(filter);
  const description = FILTER_DESCRIPTIONS[filter](currentThreshold);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-lime-deep/30 bg-lime-soft p-3 flex-wrap">
      <span className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold shrink-0">
        фильтр с обзора
      </span>
      <span className="text-sm text-ink font-medium">
        {FILTER_LABELS[filter]}
      </span>
      <span className="text-sm text-ink-soft">·</span>
      {hasThreshold(filter) ? (
        <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
          {filter === "low_stock" ? "покрытие ≤" : "покрытие >"}
          <input
            type="number"
            value={localThreshold}
            min={1}
            max={365}
            onChange={(e) => setLocalThreshold(e.target.value)}
            onBlur={() => applyThreshold(localThreshold)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyThreshold(localThreshold);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="w-16 px-2 py-1 border border-line rounded bg-paper text-center font-mono text-sm focus:outline-none focus:border-lime-deep"
          />
          дней
          <InfoTooltip text="Измените порог чтобы пересчитать список. Нажмите Enter или кликните вне поля для применения." />
        </span>
      ) : (
        <span className="text-sm text-ink-soft">{description}</span>
      )}
      <span className="ml-auto inline-flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
          период {periodDays} дней
        </span>
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            if (segmentFilter) params.set("segment", segmentFilter);
            router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}` as any);
          }}
          className="text-xs font-medium text-ink-muted hover:text-ink underline underline-offset-2 transition"
        >
          сбросить
        </button>
      </span>
    </div>
  );
}
