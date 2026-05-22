"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Панель фильтров для страницы /dashboard/skus.
 *
 * Хранит state в URL — это даёт shareable-ссылку, нормальный back-button
 * и автоматическую серверную перерисовку с фильтрацией.
 *
 * Все апдейты идут через debounce 350мс (для поиска и числовых полей),
 * чтобы не дёргать сервер на каждое нажатие клавиши.
 *
 * Поля:
 * - search: по sku и product_name (ILIKE %q%)
 * - stock_min / stock_max: диапазон по current_stock
 * - oos_min / oos_max: диапазон по stockout_days
 * - lost_min: только SKU с потерянной выручкой больше N (по умолчанию 0 = всё)
 */
export function SkusFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  // Локальные состояния — инициализируем из текущего URL
  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [stockMin, setStockMin] = useState(sp.get("stock_min") ?? "");
  const [stockMax, setStockMax] = useState(sp.get("stock_max") ?? "");
  const [oosMin, setOosMin] = useState(sp.get("oos_min") ?? "");
  const [oosMax, setOosMax] = useState(sp.get("oos_max") ?? "");
  const [lostMin, setLostMin] = useState(sp.get("lost_min") ?? "");

  // Открыт ли блок диапазонов (collapse для меньшей визуальной нагрузки)
  const [expanded, setExpanded] = useState(() => {
    return !!(sp.get("stock_min") || sp.get("stock_max")
           || sp.get("oos_min") || sp.get("oos_max")
           || sp.get("lost_min"));
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Сборка нового URL и push. Сбрасывает page при изменении фильтра.
  function pushUpdate(updates: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === "" || v == null) params.delete(k);
      else params.set(k, v);
    }
    // Сброс пагинации при любом изменении фильтров
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}` as any);
  }

  // Debounced push для любых полей — печать не должна дёргать сервер на каждый символ
  function scheduleUpdate(updates: Record<string, string>) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushUpdate(updates), 350);
  }

  // Очистка debounce при unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Синхронизация локального state когда URL поменялся снаружи (back/forward, reset-кнопка)
  useEffect(() => {
    setSearch(sp.get("q") ?? "");
    setStockMin(sp.get("stock_min") ?? "");
    setStockMax(sp.get("stock_max") ?? "");
    setOosMin(sp.get("oos_min") ?? "");
    setOosMax(sp.get("oos_max") ?? "");
    setLostMin(sp.get("lost_min") ?? "");
  }, [sp]);

  const hasAnyFilter = !!(search || stockMin || stockMax || oosMin || oosMax || lostMin);

  return (
    <div className="space-y-3">
      {/* Поиск + кнопка раскрытия диапазонов */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[260px] max-w-md relative">
          <input
            type="text"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              scheduleUpdate({ q: e.target.value });
            }}
            placeholder="Например, название бренда"
            className="w-full px-3 py-2 pl-9 border border-line rounded-lg text-sm bg-paper focus:outline-none focus:border-lime-deep transition"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-hush text-sm">⌕</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40 transition"
        >
          <span>Диапазоны</span>
          <span className={`transition-transform ${expanded ? "rotate-180" : ""}`}>▾</span>
          {hasAnyFilter && <span className="size-1.5 rounded-full bg-lime-deep" />}
        </button>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => {
              // Сбросить только наши поля, dashFilter и сегмент оставляем
              const params = new URLSearchParams(sp.toString());
              ["q", "stock_min", "stock_max", "oos_min", "oos_max", "lost_min", "page"].forEach(k => params.delete(k));
              router.replace(`${pathname}?${params.toString()}` as any);
            }}
            className="text-xs text-ink-muted hover:text-ink underline underline-offset-2 transition"
          >
            сбросить
          </button>
        )}
      </div>

      {/* Раскрывающийся блок диапазонов */}
      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 rounded-xl border border-line bg-bg-soft">
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
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
              Потерянная выручка
            </label>
            <input
              type="number"
              min={0}
              value={lostMin}
              onChange={e => { setLostMin(e.target.value); scheduleUpdate({ lost_min: e.target.value }); }}
              placeholder="от, ₽"
              className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep"
            />
            <p className="mt-1 text-[11px] text-ink-hush">только SKU с потерями &gt; этой суммы</p>
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
          min={0}
          value={minVal}
          onChange={e => onMinChange(e.target.value)}
          placeholder="от"
          className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep"
        />
        <span className="text-ink-hush">—</span>
        <input
          type="number"
          min={0}
          value={maxVal}
          onChange={e => onMaxChange(e.target.value)}
          placeholder="до"
          className="w-full px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep"
        />
      </div>
      <p className="mt-1 text-[11px] text-ink-hush">{hint}</p>
    </div>
  );
}
