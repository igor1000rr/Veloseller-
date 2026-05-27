"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InfoTooltip } from "../../_components/InfoTooltip";

export type FilterRanges = {
  stockMin: number;
  stockMax: number;
  oosMin: number;
  oosMax: number;
  lostMin: number;
  lostMax: number;
};

/**
 * Панель фильтров SKU. State в URL.
 *
 * Layout по paint-скрину Александра (27.05.2026 — возврат к развёрнутому виду):
 *  - Поиск в верхней строке + кнопка «сбросить все фильтры» если есть активные
 *  - Раскрытый блок фильтров на серой плашке:
 *    1) Период (2 даты) + чекбокс «Включить SKU без активности» с тултипом + хинт
 *       «Произвольный диапазон поверх периода 7/30/90 дней — фильтрует SKU
 *       по дате последнего пересчёта»
 *    2) Три range-фильтра в одну линию: Наличие / Дней OOS / Потерянная выручка
 *
 * История: 22.05 (commit 941b30) — был такой inline-блок по скрину Александра.
 * 25.05 (commit 720f7fa) — переведён в попап для экономии места. 27.05 —
 * Александр прислал скрин с просьбой вернуть, что и делаем.
 */
export function SkusFilters({
  warehouseCreatedAt,
  ranges,
  includeInactive,
  showInactiveToggle,
}: {
  warehouseCreatedAt: string | null;
  ranges: FilterRanges;
  includeInactive: boolean;
  /** Скрывается при активном дашборд-фильтре (там своя логика). */
  showInactiveToggle: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [stockMin, setStockMin] = useState(sp.get("stock_min") ?? "");
  const [stockMax, setStockMax] = useState(sp.get("stock_max") ?? "");
  const [oosMin, setOosMin] = useState(sp.get("oos_min") ?? "");
  const [oosMax, setOosMax] = useState(sp.get("oos_max") ?? "");
  const [lostMin, setLostMin] = useState(sp.get("lost_min") ?? "");
  const [lostMax, setLostMax] = useState(sp.get("lost_max") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("date_from") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("date_to") ?? "");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushUpdate(updates: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === "" || v == null) params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}` as any);
  }

  function scheduleUpdate(updates: Record<string, string>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushUpdate(updates), 350);
  }

  function toggleInactive() {
    pushUpdate({ include_inactive: includeInactive ? "" : "1" });
  }

  function resetAll() {
    const params = new URLSearchParams(sp.toString());
    ["q", "stock_min", "stock_max", "oos_min", "oos_max",
     "lost_min", "lost_max", "date_from", "date_to", "include_inactive",
     "page"].forEach(k => params.delete(k));
    router.replace(`${pathname}?${params.toString()}` as any);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    setSearch(sp.get("q") ?? "");
    setStockMin(sp.get("stock_min") ?? "");
    setStockMax(sp.get("stock_max") ?? "");
    setOosMin(sp.get("oos_min") ?? "");
    setOosMax(sp.get("oos_max") ?? "");
    setLostMin(sp.get("lost_min") ?? "");
    setLostMax(sp.get("lost_max") ?? "");
    setDateFrom(sp.get("date_from") ?? "");
    setDateTo(sp.get("date_to") ?? "");
  }, [sp]);

  const hasAnyFilter = !!(
    search || stockMin || stockMax || oosMin || oosMax ||
    lostMin || lostMax || dateFrom || dateTo || includeInactive
  );

  const minDate = warehouseCreatedAt ? warehouseCreatedAt.slice(0, 10) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* Раскрытый блок фильтров — как на paint-скрине Александра */}
      <div className="space-y-3 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft">
        {/* Строка 1: Период (2 даты) + чекбокс «Включить SKU без активности» */}
        <div className="flex items-start gap-x-6 gap-y-3 flex-wrap">
          <div className="min-w-0">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
              Период
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={dateFrom}
                min={minDate}
                max={dateTo || today}
                onChange={e => { setDateFrom(e.target.value); scheduleUpdate({ date_from: e.target.value }); }}
                className="flex-1 sm:flex-initial min-w-[140px] px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
              />
              <span className="text-ink-hush">—</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || minDate}
                max={today}
                onChange={e => { setDateTo(e.target.value); scheduleUpdate({ date_to: e.target.value }); }}
                className="flex-1 sm:flex-initial min-w-[140px] px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
              />
            </div>
          </div>

          {showInactiveToggle && (
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                onClick={toggleInactive}
                className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition py-2 -my-2 min-h-[36px]"
              >
                <span className={`size-5 rounded border ${includeInactive ? "bg-ink border-ink" : "bg-paper border-line"} flex items-center justify-center transition shrink-0`}>
                  {includeInactive && <span className="text-paper text-[11px]">✓</span>}
                </span>
                <span>Включить SKU без активности</span>
              </button>
              <InfoTooltip text="Товары с нулевым остатком и без движений за последние 30 дней. По умолчанию скрыты — их не нужно учитывать в большинстве сценариев." />
            </div>
          )}
        </div>

        {/* Подсказка под строкой Период — что вообще делают эти фильтры */}
        {minDate && (
          <p className="text-[11px] text-ink-hush font-mono">
            данные с {new Date(minDate).toLocaleDateString("ru-RU")}
          </p>
        )}
        <p className="text-[11px] text-ink-hush leading-relaxed">
          Произвольный диапазон поверх периода 7/30/90 дней — фильтрует SKU по дате последнего пересчёта.
        </p>

        {/* Строка 2: 3 range-фильтра в одну линию (на мобиле stack) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          <RangeField
            label="Наличие"
            hint="Текущий остаток на складе"
            minPlaceholder={String(ranges.stockMin)}
            maxPlaceholder={String(ranges.stockMax)}
            minVal={stockMin}
            maxVal={stockMax}
            onMinChange={v => { setStockMin(v); scheduleUpdate({ stock_min: v }); }}
            onMaxChange={v => { setStockMax(v); scheduleUpdate({ stock_max: v }); }}
          />
          <RangeField
            label="Дней OOS"
            hint="Out-of-stock дней за выбранный период"
            minPlaceholder={String(ranges.oosMin)}
            maxPlaceholder={String(ranges.oosMax)}
            minVal={oosMin}
            maxVal={oosMax}
            onMinChange={v => { setOosMin(v); scheduleUpdate({ oos_min: v }); }}
            onMaxChange={v => { setOosMax(v); scheduleUpdate({ oos_max: v }); }}
          />
          <RangeField
            label="Потерянная выручка, ₽"
            hint="velocity × stockout × price"
            minPlaceholder={Math.round(ranges.lostMin).toString()}
            maxPlaceholder={Math.round(ranges.lostMax).toString()}
            minVal={lostMin}
            maxVal={lostMax}
            onMinChange={v => { setLostMin(v); scheduleUpdate({ lost_min: v }); }}
            onMaxChange={v => { setLostMax(v); scheduleUpdate({ lost_max: v }); }}
          />
        </div>
      </div>

      {/* Строка поиска + сброс — под блоком фильтров. На скрине Александра
          поиск стоит ПОД блоком фильтров вместе с сегментами/экспортом,
          но сегменты/экспорт у нас в page.tsx header — оставляем там.
          Поиск размещаем здесь чтобы вся фильтрация была в одном месте. */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div className="w-full sm:flex-1 sm:min-w-[260px] sm:max-w-md relative">
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              scheduleUpdate({ q: e.target.value });
            }}
            placeholder="Например, название бренда"
            className="w-full px-3 py-2 pl-9 border border-line rounded-lg text-sm bg-paper focus:outline-none focus:border-lime-deep transition min-h-[40px]"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-hush text-sm">⌕</span>
        </div>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-ink-muted hover:text-ink underline underline-offset-2 transition py-2"
          >
            сбросить все фильтры
          </button>
        )}
      </div>
    </div>
  );
}

function RangeField({
  label, hint, minVal, maxVal, onMinChange, onMaxChange,
  minPlaceholder = "от", maxPlaceholder = "до",
}: {
  label: string;
  hint: string;
  minVal: string;
  maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={minVal}
          onChange={e => onMinChange(e.target.value)}
          placeholder={minPlaceholder}
          className="w-full min-w-0 px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
        />
        <span className="text-ink-hush">—</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={maxVal}
          onChange={e => onMaxChange(e.target.value)}
          placeholder={maxPlaceholder}
          className="w-full min-w-0 px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-hush">{hint}</p>
    </div>
  );
}
