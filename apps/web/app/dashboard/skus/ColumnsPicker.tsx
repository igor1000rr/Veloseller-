"use client";

import { useEffect, useState } from "react";

/**
 * Регулировка видимости столбцов в таблице SKU (правка 8 Александра:
 * "И возможность регулировки столбцов").
 *
 * Сохраняет выбор в localStorage под ключом VELOSELLER_SKU_COLUMNS.
 *
 * Mobile-friendly: при первой загрузке (localStorage пуст) определяем
 * ширину окна и показываем только важные колонки на мобиле, чтобы не
 * было полотна-скрола из 15 столбцов.
 *
 * Подход без перекомпиляции SSR: page.tsx навешивает классы col-skucol-<key>
 * на каждую ячейку <th>/<td>, а здесь генерим CSS-правила display:none
 * для скрытых ключей через inline <style> тег.
 */

export type ColumnKey =
  | "sku" | "name" | "stock" | "price" | "tvelo" | "median" | "trend"
  | "coverage" | "oos" | "sales" | "reorder" | "confidence" | "health"
  | "lost_revenue" | "notes";

export const ALL_COLUMNS: { key: ColumnKey; label: string; required?: boolean }[] = [
  { key: "sku",          label: "SKU",                required: true },
  { key: "name",         label: "Название",           required: true },
  { key: "stock",        label: "Остаток" },
  { key: "price",        label: "Цена" },
  { key: "tvelo",        label: "TVelo" },
  { key: "median",       label: "Медиана" },
  { key: "trend",        label: "Тренд" },
  { key: "coverage",     label: "Покрытие" },
  { key: "oos",          label: "OOS" },
  { key: "sales",        label: "Продажи" },
  { key: "reorder",      label: "Закупка" },
  { key: "confidence",   label: "ДСТ" },
  { key: "health",       label: "Health" },
  { key: "lost_revenue", label: "Потерянная выручка" },
  { key: "notes",        label: "Заметки" },
];

const STORAGE_KEY = "veloseller-sku-columns";

const DESKTOP_DEFAULT: ColumnKey[] = ALL_COLUMNS.map(c => c.key);

// На мобиле по умолчанию — только самое важное. Юзер может включить остальные
// через ColumnsPicker, и его выбор уйдёт в localStorage с учётом этого.
const MOBILE_DEFAULT: ColumnKey[] = [
  "sku", "name", "stock", "tvelo", "coverage", "lost_revenue", "notes",
];

function readStoredColumns(): Set<ColumnKey> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((k): k is ColumnKey =>
      typeof k === "string" && ALL_COLUMNS.some(c => c.key === k)
    ));
  } catch {
    return null;
  }
}

export function ColumnsPicker() {
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState<Set<ColumnKey>>(() => new Set(DESKTOP_DEFAULT));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredColumns();
    if (stored && stored.size > 0) {
      // required всегда видимы, даже если их нет в localStorage
      for (const col of ALL_COLUMNS) {
        if (col.required) stored.add(col.key);
      }
      setVisible(stored);
    } else {
      // Первый заход — мобильный или десктопный дефолт
      const isMobile = window.matchMedia("(max-width: 767px)").matches;
      setVisible(new Set(isMobile ? MOBILE_DEFAULT : DESKTOP_DEFAULT));
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visible)));
    } catch {
      // localStorage недоступен — игнорируем
    }
  }, [visible, hydrated]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-columns-picker]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
    };
  }, [open]);

  function toggle(key: ColumnKey) {
    const col = ALL_COLUMNS.find(c => c.key === key);
    if (col?.required) return;
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function showAll() {
    setVisible(new Set(DESKTOP_DEFAULT));
  }

  function showMobileOnly() {
    setVisible(new Set(MOBILE_DEFAULT));
  }

  function clearAll() {
    setVisible(new Set(ALL_COLUMNS.filter(c => c.required).map(c => c.key)));
  }

  const hiddenCount = ALL_COLUMNS.length - visible.size;

  const hiddenKeys = ALL_COLUMNS.filter(c => !visible.has(c.key)).map(c => c.key);
  const css = hidden_css_rules(hiddenKeys);

  return (
    <>
      {hydrated && hiddenKeys.length > 0 && (
        <style dangerouslySetInnerHTML={{ __html: css }} />
      )}

      <div className="relative" data-columns-picker>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40 transition min-h-[36px]"
          title="Регулировка столбцов"
        >
          <span>☰ Столбцы</span>
          {hiddenCount > 0 && (
            <span className="font-mono text-[10px] text-lime-deep font-semibold">
              {visible.size}/{ALL_COLUMNS.length}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 z-20 w-[calc(100vw-2rem)] max-w-xs sm:w-64 rounded-xl border border-line bg-paper shadow-lg p-3">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
                Видимые столбцы
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={showAll}
                  className="text-[10px] font-mono uppercase tracking-wider text-lime-deep hover:text-ink transition"
                  title="Показать все"
                >
                  все
                </button>
                <button
                  type="button"
                  onClick={showMobileOnly}
                  className="text-[10px] font-mono uppercase tracking-wider text-ink-muted hover:text-ink transition"
                  title="Преcет для мобильного — только важные"
                >
                  мобильно
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[10px] font-mono uppercase tracking-wider text-ink-muted hover:text-ink transition"
                  title="Скрыть всё необязательное"
                >
                  свернуть
                </button>
              </div>
            </div>
            <ul className="space-y-0.5 max-h-[60vh] overflow-y-auto">
              {ALL_COLUMNS.map(col => {
                const checked = visible.has(col.key);
                return (
                  <li key={col.key}>
                    <label className={`flex items-center gap-2 px-2 py-2 rounded text-sm cursor-pointer hover:bg-bg-soft transition ${
                      col.required ? "opacity-60 cursor-not-allowed" : ""
                    }`}>
                      <span className={`size-5 shrink-0 rounded border flex items-center justify-center transition ${
                        checked ? "bg-ink border-ink" : "bg-paper border-line"
                      }`}>
                        {checked && <span className="text-paper text-[11px]">✓</span>}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={col.required}
                        onChange={() => toggle(col.key)}
                        className="sr-only"
                      />
                      <span className="text-ink-soft">{col.label}</span>
                      {col.required && (
                        <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-ink-hush">обяз.</span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 pt-2 border-t border-line text-[10px] text-ink-hush font-mono">
              Настройка сохраняется в этом браузере
            </p>
          </div>
        )}
      </div>
    </>
  );
}

function hidden_css_rules(hiddenKeys: ColumnKey[]): string {
  return hiddenKeys
    .map(k => `.col-skucol-${k} { display: none !important; }`)
    .join("\n");
}
