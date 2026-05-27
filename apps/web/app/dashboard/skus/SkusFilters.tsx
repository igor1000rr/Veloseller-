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
 * Серая плашка раскрытых фильтров.
 *
 * Поля «Период» всегда заполнены датами (defaultDateFrom/defaultDateTo).
 * Если передан preHolidayLabel — показываем ярлык предпраздничного периода.
 */
export function SkusFilters({
  warehouseCreatedAt,
  ranges,
  includeInactive,
  showInactiveToggle,
  defaultDateFrom,
  defaultDateTo,
  preHolidayLabel,
}: {
  warehouseCreatedAt: string | null;
  ranges: FilterRanges;
  includeInactive: boolean;
  showInactiveToggle: boolean;
  defaultDateFrom: string;
  defaultDateTo: string;
  /** Напр. «🎁 Предпраздничный: 14 дней до Нового года». Не показываем если null. */
  preHolidayLabel?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [stockMin, setStockMin] = useState(sp.get("stock_min") ?? "");
  const [stockMax, setStockMax] = useState(sp.get("stock_max") ?? "");
  const [oosMin, setOosMin] = useState(sp.get("oos_min") ?? "");
  const [oosMax, setOosMax] = useState(sp.get("oos_max") ?? "");
  const [lostMin, setLostMin] = useState(sp.get("lost_min") ?? "");
  const [lostMax, setLostMax] = useState(sp.get("lost_max") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("date_from") || defaultDateFrom);
  const [dateTo, setDateTo] = useState(sp.get("date_to") || defaultDateTo);

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

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    setStockMin(sp.get("stock_min") ?? "");
    setStockMax(sp.get("stock_max") ?? "");
    setOosMin(sp.get("oos_min") ?? "");
    setOosMax(sp.get("oos_max") ?? "");
    setLostMin(sp.get("lost_min") ?? "");
    setLostMax(sp.get("lost_max") ?? "");
    setDateFrom(sp.get("date_from") || defaultDateFrom);
    setDateTo(sp.get("date_to") || defaultDateTo);
  }, [sp, defaultDateFrom, defaultDateTo]);

  const minDate = warehouseCreatedAt ? warehouseCreatedAt.slice(0, 10) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft">
      <div className="flex items-start gap-x-6 gap-y-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
              Период
            </label>
            {preHolidayLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-orange/40 bg-orange/10 text-orange font-mono text-[10px] uppercase tracking-wider font-semibold">
                {preHolidayLabel}
              </span>
            )}
          </div>
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

      {minDate && (
        <p className="text-[11px] text-ink-hush font-mono">
          данные с {new Date(minDate).toLocaleDateString("ru-RU")}
        </p>
      )}
      <p className="text-[11px] text-ink-hush leading-relaxed">
        Период расчёта скорости продаж. По умолчанию — последние 30 дней. Перед праздниками автоматически сужается до предпраздничного окна.
      </p>

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
