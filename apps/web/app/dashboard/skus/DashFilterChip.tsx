"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { InfoTooltip } from "../../_components/InfoTooltip";
import { t } from "@/lib/i18n";

// Расширено (правка 4): добавлены frequently_oos / inventory_concentration /
// demand_concentration для трёх блоков полосы 4 на /dashboard.
type DashFilter =
  | "low_stock"
  | "lost_revenue"
  | "dead_inventory"
  | "oos"
  | "inactive"
  | "frequently_oos"
  | "inventory_concentration"
  | "demand_concentration";

const FILTER_LABELS: Record<DashFilter, string> = {
  low_stock:               t("sku.filter.lowStock.label"),
  lost_revenue:            t("sku.filter.lostRevenue.label"),
  dead_inventory:          t("sku.filter.dead.label"),
  oos:                     t("sku.filter.oos.label"),
  inactive:                t("sku.filter.inactive.label"),
  frequently_oos:          t("sku.filter.frequentOos.label"),
  inventory_concentration: t("sku.filter.invConc.label"),
  demand_concentration:    t("sku.filter.demandConc.label"),
};

const FILTER_DESCRIPTIONS: Record<DashFilter, (threshold: number) => string> = {
  low_stock:               (n) => t("sku.filter.lowStock.desc", { n }),
  lost_revenue:            () => t("sku.filter.lostRevenue.desc"),
  dead_inventory:          (n) => t("sku.filter.dead.desc", { n }),
  oos:                     () => t("sku.filter.oos.desc"),
  inactive:                () => t("sku.filter.inactive.desc"),
  frequently_oos:          (n) => t("sku.filter.frequentOos.desc", { n }),
  inventory_concentration: () => t("sku.filter.invConc.desc"),
  demand_concentration:    () => t("sku.filter.demandConc.desc"),
};

function hasThreshold(filter: DashFilter): boolean {
  // Концентрационные фильтры порога не имеют (топ-N определяется RPC).
  return filter === "low_stock" || filter === "dead_inventory" || filter === "frequently_oos";
}

function defaultThreshold(filter: DashFilter): number {
  if (filter === "low_stock") return 7;
  if (filter === "dead_inventory") return 180;
  if (filter === "frequently_oos") return 15;
  return 0;
}

/**
 * Активный чип фильтра с обзора (правка 8 Александра).
 *
 * Mobile-friendly layout: на узких экранах элементы разносим по строкам
 * через grid, на десктопе — горизонтальная полоса. Inputs увеличены для
 * удобного попадания пальцем.
 */
export function DashFilterChip({ filter, periodDays, threshold, segmentFilter }: {
  filter: DashFilter;
  periodDays: number;
  threshold: number | null;
  segmentFilter: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const initialThreshold = threshold ?? defaultThreshold(filter);
  const [localThreshold, setLocalThreshold] = useState(String(initialThreshold));

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
  // Защита от неизвестного фильтра (напр. "active" из DashboardFilter, которого
  // нет в карте чипа): без неё FILTER_DESCRIPTIONS[filter] === undefined и вызов
  // undefined(...) роняет страницу SKU. Тип DashFilter/DashboardFilter
  // синхронизируется отдельно в type-cleanup.
  const description = (FILTER_DESCRIPTIONS[filter] ?? (() => ""))(currentThreshold);

  // Префикс для подписи рядом с input — зависит от фильтра.
  const thresholdPrefix =
    filter === "low_stock" ? t("sku.filter.prefix.coverageLe") :
    filter === "dead_inventory" ? t("sku.filter.prefix.coverageGt") :
    filter === "frequently_oos" ? t("sku.filter.prefix.oosGt") :
    "";

  const thresholdSuffix =
    filter === "frequently_oos" ? t("sku.filter.suffix.daysPeriod") : t("unit.days.many");

  return (
    <div className="rounded-xl border border-lime-deep/30 bg-lime-soft p-3">
      {/* Верхняя строка: метка фильтра */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-lime-deep font-semibold shrink-0">
          {t("sku.filter.fromOverview")}
        </span>
        <span className="text-sm text-ink font-medium">
          {FILTER_LABELS[filter]}
        </span>
      </div>

      {/* Средняя: значение/инпут порога. На мобиле stack, на md+ inline */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasThreshold(filter) ? (
          <span className="inline-flex items-center gap-2 text-sm text-ink-soft">
            {thresholdPrefix}
            <input
              type="number"
              inputMode="numeric"
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
              className="w-20 px-2 py-1.5 border border-line rounded bg-paper text-center font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
            />
            {thresholdSuffix}
            <InfoTooltip text={t("sku.filter.thresholdHint")} />
          </span>
        ) : (
          <span className="text-sm text-ink-soft">{description}</span>
        )}
      </div>

      {/* Нижняя строка: период + сбросить, separator-line на мобиле */}
      <div className="mt-3 pt-3 border-t border-lime-deep/20 flex items-center justify-between gap-3 flex-wrap">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">
          {t("sku.filter.periodDays", { n: periodDays })}
        </span>
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams();
            if (segmentFilter) params.set("segment", segmentFilter);
            router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}` as any);
          }}
          className="text-xs font-medium text-ink-muted hover:text-ink underline underline-offset-2 transition py-1"
        >
          {t("sku.filter.reset")}
        </button>
      </div>
    </div>
  );
}
