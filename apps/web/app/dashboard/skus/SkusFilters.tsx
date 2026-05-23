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
 * Layout по правке Александра (paint-скрин):
 * - ПЕРИОД (2 даты) + чекбокс «Включить SKU без активности» в одной строке
 * - НАЛИЧИЕ / ДНЕЙ БЕЗ ПРОДАЖ / ПОТЕРЯННАЯ ВЫРУЧКА — в одну линию (3 колонки)
 * - Placeholder в полях «от»/«до» — реальные min/max из БД (видно диапазон)
 *
 * Правка 10 Правок 4: label «Дней OOS» → «Дней без продаж».
 * URL-параметры oos_min/oos_max остались (stockout_days в БД) — не ломаем
 * букмарки и внешние линки из обзора.
 *
 * Блок всегда раскрыт (предыдущий коммит 2f4b4cc — «всё важно и нужно»).
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
  /** Показывать ли чекбокс — скрывается при активном дашборд-фильтре. */
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

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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
    lostMin || lostMax || dateFrom || dateTo
  );

  const minDate = warehouseCreatedAt ? warehouseCreatedAt.slice(0, 10) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* Поиск + сброс в верхней строке */}
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
            onClick={() => {
              const params = new URLSearchParams(sp.toString());
              ["q", "stock_min", "stock_max", "oos_min", "oos_max",
               "lost_min", "lost_max", "date_from", "date_to", "page"].forEach(k => params.delete(k));
              router.replace(`${pathname}?${params.toString()}` as any);
            }}
            className="text-xs text-ink-muted hover:text-ink underline underline-offset-2 transition py-2"
          >
            сбросить все фильтры
          </button>
        )}
      </div>

      {/* Блок фильтров — всегда раскрыт */}
      <div className="space-y-3 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft">
        {/* Строка 1: ПЕРИОД + чекбокс в одной линии */}
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
            {minDate && (
              <p className="mt-1 text-[11px] text-ink-hush font-mono">
                данные с {new Date(minDate).toLocaleDateString("ru-RU")}
              </p>
            )}
          </div>

          {/* Чекбокс «Включить SKU без активности» — рядом с периодом, как на скрине Александра.
              Скрыт при активном дашборд-фильтре (там своя логика). */}
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

        {/* Строка 2: 3 range-фильтра в одной линии (на мобиле stack) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
            label="Дней без продаж"
            hint="Сколько дней товар отсутствовал на складе (OOS) за период"
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
          className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
        />
        <span className="text-ink-hush">—</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={maxVal}
          onChange={e => onMaxChange(e.target.value)}
          placeholder={maxPlaceholder}
          className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-hush">{hint}</p>
    </div>
  );
}
