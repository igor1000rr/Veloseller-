"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
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
 * Панель фильтров SKU.
 *
 * Новый layout (правка 5): компактная кнопка «Фильтры» с бейджем количества
 * активных, попап с теми же полями, активные показываются чипами рядом с поиском.
 *
 * Раньше блок был всегда раскрыт «коробкой» на пол-экрана. Большую часть времени
 * пользователь работает без фильтров — этот блок только мешал. Теперь без активных
 * фильтров видна одна кнопка, с активными — чипы по сути, всё помещается в строку.
 *
 * State в URL. Попап рендерится через React Portal в document.body чтобы не
 * обрезался overflow таблицы (тот же приём что у InfoTooltip).
 *
 * Правка 7 (25.05.2026): «Дней без продаж» → «Дней без наличия» — точнее по
 * смыслу. Поле считает stockout_days (out-of-stock дни), т.е. сколько дней
 * товара не было на складе. URL-параметры oos_min/oos_max не меняем — не
 * ломаем букмарки и внешние ссылки.
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

  // ===== Подсчёт чипов =====
  type Chip = { key: string; label: string; onClear: () => void };
  const chips: Chip[] = [];
  if (dateFrom || dateTo) {
    chips.push({
      key: "date",
      label: `Период: ${fmtDateShort(dateFrom) || "…"} — ${fmtDateShort(dateTo) || "…"}`,
      onClear: () => pushUpdate({ date_from: "", date_to: "" }),
    });
  }
  if (stockMin || stockMax) {
    chips.push({
      key: "stock",
      label: `Наличие: ${stockMin || "0"} – ${stockMax || "∞"}`,
      onClear: () => pushUpdate({ stock_min: "", stock_max: "" }),
    });
  }
  if (oosMin || oosMax) {
    chips.push({
      key: "oos",
      label: `Дней без наличия: ${oosMin || "0"} – ${oosMax || "∞"}`,
      onClear: () => pushUpdate({ oos_min: "", oos_max: "" }),
    });
  }
  if (lostMin || lostMax) {
    chips.push({
      key: "lost",
      label: `Потерянная выручка: ${lostMin || "0"} – ${lostMax || "∞"}`,
      onClear: () => pushUpdate({ lost_min: "", lost_max: "" }),
    });
  }
  if (showInactiveToggle && includeInactive) {
    chips.push({
      key: "inactive",
      label: "Включая SKU без активности",
      onClear: () => pushUpdate({ include_inactive: "" }),
    });
  }

  // Поиск (q) не считаем в чипах — он в собственном поле.
  const filterCount = chips.length;
  const hasAnything = !!search || filterCount > 0;

  // ===== Popover state =====
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const compute = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const margin = 8;
      const isNarrow = window.innerWidth < 640;
      // На мобиле — почти на весь экран. На десктопе — фикс. ширина.
      const width = isNarrow
        ? Math.min(window.innerWidth - margin * 2, 480)
        : 440;
      let left = r.left;
      // Чтобы не вылезал за правый край viewport
      if (left + width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - width - margin);
      }
      if (left < margin) left = margin;
      const top = r.bottom + 6;
      setCoords({ top, left, width });
    };

    compute();
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  // Закрытие по клику вне или Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const minDate = warehouseCreatedAt ? warehouseCreatedAt.slice(0, 10) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Поиск */}
      <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[240px] sm:max-w-sm">
        <input
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            scheduleUpdate({ q: e.target.value });
          }}
          placeholder="Поиск по SKU или названию"
          className="w-full pl-9 pr-3 py-2 border border-line rounded-lg text-sm bg-paper focus:outline-none focus:border-lime-deep transition min-h-[40px]"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-hush text-sm">⌕</span>
      </div>

      {/* Кнопка Фильтры */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition min-h-[40px] ${
          open
            ? "border-lime-deep bg-lime-soft text-ink"
            : filterCount > 0
              ? "border-lime-deep/40 bg-lime-soft/40 text-ink hover:border-lime-deep"
              : "border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40"
        }`}
        aria-expanded={open}
      >
        <span>Фильтры</span>
        {filterCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-lime-deep text-paper text-[10px] font-mono font-semibold">
            {filterCount}
          </span>
        )}
        <span className={`text-ink-hush text-[10px] transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Активные чипы */}
      {chips.map(c => (
        <button
          key={c.key}
          type="button"
          onClick={c.onClear}
          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full border border-lime-deep/30 bg-lime-soft text-xs text-ink hover:border-lime-deep transition group min-h-[32px]"
          title="Удалить фильтр"
        >
          <span>{c.label}</span>
          <span className="size-4 rounded-full bg-ink/10 group-hover:bg-rose/20 flex items-center justify-center text-[10px] text-ink-muted group-hover:text-rose transition">×</span>
        </button>
      ))}

      {/* Сбросить все */}
      {hasAnything && (
        <button
          type="button"
          onClick={resetAll}
          className="text-xs text-ink-muted hover:text-ink underline underline-offset-2 transition py-2"
        >
          сбросить
        </button>
      )}

      {/* ===== Popover ===== */}
      {mounted && open && coords && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            width: coords.width,
            maxHeight: "calc(100vh - 100px)",
            zIndex: 9990,
          }}
          className="bg-paper border border-line rounded-xl shadow-lg p-4 overflow-y-auto"
          role="dialog"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
              Фильтры
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-hush hover:text-ink text-sm leading-none p-1"
              aria-label="Закрыть"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            {/* Период */}
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
                Период
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateFrom}
                  min={minDate}
                  max={dateTo || today}
                  onChange={e => { setDateFrom(e.target.value); scheduleUpdate({ date_from: e.target.value }); }}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
                />
                <span className="text-ink-hush text-sm">—</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || minDate}
                  max={today}
                  onChange={e => { setDateTo(e.target.value); scheduleUpdate({ date_to: e.target.value }); }}
                  className="flex-1 min-w-0 px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
                />
              </div>
              {minDate && (
                <p className="mt-1 text-[11px] text-ink-hush font-mono">
                  данные с {new Date(minDate).toLocaleDateString("ru-RU")}
                </p>
              )}
            </div>

            <RangeField
              label="Наличие на складе"
              hint={ranges.stockMax > 0 ? `на складе: от ${ranges.stockMin} до ${ranges.stockMax}` : undefined}
              minPlaceholder={String(ranges.stockMin)}
              maxPlaceholder={String(ranges.stockMax)}
              minVal={stockMin}
              maxVal={stockMax}
              onMinChange={v => { setStockMin(v); scheduleUpdate({ stock_min: v }); }}
              onMaxChange={v => { setStockMax(v); scheduleUpdate({ stock_max: v }); }}
            />

            <RangeField
              label="Дней без наличия (OOS)"
              hint="сколько дней товар отсутствовал на складе за период"
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

            {showInactiveToggle && (
              <div className="pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={toggleInactive}
                  className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition py-1"
                >
                  <span className={`size-5 rounded border ${includeInactive ? "bg-ink border-ink" : "bg-paper border-line"} flex items-center justify-center transition shrink-0`}>
                    {includeInactive && <span className="text-paper text-[11px]">✓</span>}
                  </span>
                  <span>Включить SKU без активности</span>
                </button>
                <p className="mt-1 ml-7 text-[11px] text-ink-hush leading-relaxed">
                  Товары с 0 остатком и без движений за 30 дней. По умолчанию скрыты.
                </p>
              </div>
            )}
          </div>

          {filterCount > 0 && (
            <div className="mt-4 pt-3 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={() => {
                  resetAll();
                  setOpen(false);
                }}
                className="text-xs text-ink-muted hover:text-ink underline underline-offset-2 transition"
              >
                сбросить все фильтры
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function RangeField({
  label, hint, minVal, maxVal, onMinChange, onMaxChange,
  minPlaceholder = "от", maxPlaceholder = "до",
}: {
  label: string;
  hint?: string;
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
        <span className="text-ink-hush text-sm">—</span>
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
      {hint && <p className="mt-1 text-[11px] text-ink-hush">{hint}</p>}
    </div>
  );
}

/** Короткий формат даты "22.05.2026". Пустая строка если не задано. */
function fmtDateShort(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
