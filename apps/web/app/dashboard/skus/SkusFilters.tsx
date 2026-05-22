"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Панель фильтров SKU. State в URL.
 * Mobile-friendly: поиск занимает всю ширину на мобиле, диапазоны stack.
 *
 * Блок "Диапазоны" по умолчанию РАСКРЫТ (правка пользователя — всё важно и нужно).
 * Кнопка остаётся, чтобы можно было свернуть и освободить экран при необходимости.
 */
export function SkusFilters({ warehouseCreatedAt }: { warehouseCreatedAt: string | null }) {
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

  // По умолчанию раскрыто всегда — диапазоны важны и нужны пользователю.
  // Раньше: раскрыто только если уже стоял какой-то range-фильтр в URL.
  const [expanded, setExpanded] = useState(true);

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
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        {/* Поиск: на мобиле full-width, на sm+ flex-1 max-w-md */}
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
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40 transition min-h-[36px]"
        >
          <span>Диапазоны</span>
          <span className={`transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
          {hasAnyFilter && <span className="size-1.5 rounded-full bg-lime-deep" />}
        </button>
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
            сбросить
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-3 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft">
          {/* Календарь — на мобиле inputs стакаются */}
          <div>
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
            <p className="mt-1 text-[11px] text-ink-hush">
              Произвольный диапазон поверх периода 7/30/90 дней — фильтрует SKU по дате последнего пересчёта.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <RangeField
              label="Наличие"
              hint="Текущий остаток на складе"
              minVal={stockMin}
              maxVal={stockMax}
              onMinChange={v => { setStockMin(v); scheduleUpdate({ stock_min: v }); }}
              onMaxChange={v => { setStockMax(v); scheduleUpdate({ stock_max: v }); }}
            />
            <RangeField
              label="Дней OOS"
              hint="Out-of-stock дней за выбранный период"
              minVal={oosMin}
              maxVal={oosMax}
              onMinChange={v => { setOosMin(v); scheduleUpdate({ oos_min: v }); }}
              onMaxChange={v => { setOosMax(v); scheduleUpdate({ oos_max: v }); }}
            />
            <RangeField
              label="Потерянная выручка, ₽"
              hint="velocity × stockout × price"
              minVal={lostMin}
              maxVal={lostMax}
              onMinChange={v => { setLostMin(v); scheduleUpdate({ lost_min: v }); }}
              onMaxChange={v => { setLostMax(v); scheduleUpdate({ lost_max: v }); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RangeField({ label, hint, minVal, maxVal, onMinChange, onMaxChange }: {
  label: string;
  hint: string;
  minVal: string;
  maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
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
          placeholder="от"
          className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
        />
        <span className="text-ink-hush">—</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={maxVal}
          onChange={e => onMaxChange(e.target.value)}
          placeholder="до"
          className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-hush">{hint}</p>
    </div>
  );
}
