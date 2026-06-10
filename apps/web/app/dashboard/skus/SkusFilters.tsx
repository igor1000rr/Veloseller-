"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InfoTooltip } from "../../_components/InfoTooltip";
import { t } from "@/lib/i18n";
import { LOCALE } from "@/lib/features";
import { clearAllUserNotes } from "./actions";

// RU/.com для инлайн-строк галочки «Стереть заметки» (без i18n-ключей ради 2 строк).
const isEn = LOCALE === "en";

export type FilterRanges = {
  stockMin: number;
  stockMax: number;
  oosMin: number;
  oosMax: number;
  lostMin: number;
  lostMax: number;
  coverageMin: number;
  coverageMax: number;
};

/**
 * Серая плашка раскрытых фильтров.
 *
 * Александр 01.06.2026 (правки 7):
 *  - "Дней OOS" → "Дней без наличия"
 *  - "Out-of-stock..." → "Дней без наличия за выбранный период"
 *  - "velocity × stockout × price" → формула на русском
 *  - Новый фильтр "Дней до окончания остатков" (по coverage_days)
 *  - Кнопка «Рассчитать» — psycologically даёт пользователю явный триггер
 *
 * Александр 04.06.2026:
 *  - Авторасчёт при вводе убран (debounce-обновление URL на каждый символ) —
 *    все расчёты запускает только кнопка «Рассчитать». Меньше нагрузка и логичнее.
 *    Исключение — чекбокс «Включить SKU без активности»: это явный клик-
 *    переключатель, применяется сразу.
 *  - Поле «Закупка на N дней» переехало сюда из шапки списка. Старая шапочная
 *    GET-форма со стрелкой при сабмите теряла date_from/date_to и все min/max-
 *    диапазоны (hidden-поля сохраняли не всё) — отсюда нули в закупке.
 *    Теперь «Рассчитать» пишет в URL все параметры разом, включая reorder_days.
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
  const [coverageMin, setCoverageMin] = useState(sp.get("coverage_min") ?? "");
  const [coverageMax, setCoverageMax] = useState(sp.get("coverage_max") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("date_from") || defaultDateFrom);
  const [dateTo, setDateTo] = useState(sp.get("date_to") || defaultDateTo);
  // Закупка на N дней — дефолт 30 синхронизирован с сервером (page.tsx).
  const [reorderDays, setReorderDays] = useState(sp.get("reorder_days") ?? "30");
  // Правка 10 (#1): галочка «Стереть заметки» (по умолчанию выкл). При «Рассчитать»
  // с включённой галочкой — подтверждение и удаление ВСЕХ заметок селлера.
  const [eraseNotes, setEraseNotes] = useState(false);
  const [clearing, setClearing] = useState(false);

  function pushUpdate(updates: Record<string, string>) {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === "" || v == null) params.delete(k);
      else params.set(k, v);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}` as any);
  }

  function recalculateNow() {
    // Принудительно применяем все текущие значения формы — единственный триггер расчёта.
    // Александр 01.06.2026: "психологически понятнее — нажал → получил расчёт".
    // Значение "30" в reorder_days не пишем в URL — это серверный дефолт.
    pushUpdate({
      stock_min: stockMin, stock_max: stockMax,
      oos_min: oosMin,     oos_max: oosMax,
      lost_min: lostMin,   lost_max: lostMax,
      coverage_min: coverageMin, coverage_max: coverageMax,
      date_from: dateFrom, date_to: dateTo,
      reorder_days: reorderDays === "30" ? "" : reorderDays,
    });
    // 04.06.2026 (фикс «Рассчитать не считает»): если URL не изменился,
    // router.replace не перерисовывает server component — refresh гарантирует
    // пересчёт страницы при каждом нажатии кнопки.
    router.refresh();
  }

  // Правка 10 (#1): клик «Рассчитать». С включённой галочкой — подтверждение,
  // чистка всех заметок, затем обычный пересчёт (при ошибке тоже пересчитываем).
  async function onCalcClick() {
    if (!eraseNotes) {
      recalculateNow();
      return;
    }
    const msg = isEn
      ? "Delete ALL your notes across every SKU? This cannot be undone."
      : "Удалить ВСЕ заметки по всем SKU? Действие необратимо.";
    if (!window.confirm(msg)) return;
    setClearing(true);
    const res = await clearAllUserNotes();
    setClearing(false);
    setEraseNotes(false);
    if (!res.ok) {
      window.alert(isEn ? "Failed to clear notes" : "Не удалось стереть заметки");
    }
    recalculateNow();
  }

  function toggleInactive() {
    pushUpdate({ include_inactive: includeInactive ? "" : "1" });
  }

  useEffect(() => {
    setStockMin(sp.get("stock_min") ?? "");
    setStockMax(sp.get("stock_max") ?? "");
    setOosMin(sp.get("oos_min") ?? "");
    setOosMax(sp.get("oos_max") ?? "");
    setLostMin(sp.get("lost_min") ?? "");
    setLostMax(sp.get("lost_max") ?? "");
    setCoverageMin(sp.get("coverage_min") ?? "");
    setCoverageMax(sp.get("coverage_max") ?? "");
    setDateFrom(sp.get("date_from") || defaultDateFrom);
    setDateTo(sp.get("date_to") || defaultDateTo);
    setReorderDays(sp.get("reorder_days") ?? "30");
  }, [sp, defaultDateFrom, defaultDateTo]);

  const minDate = warehouseCreatedAt ? warehouseCreatedAt.slice(0, 10) : undefined;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* Группировка по макету Александра (правки 7): две секции —
          «Период и расчёт» и «Фильтры метрик». Цвета/токены — наши. */}
      <section className="space-y-3 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft">
        <SectionHeader label={t("sku.filters.section.period")} />
      <div className="flex items-start gap-x-6 gap-y-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
              {t("sku.filters.period")}
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
              onChange={e => setDateFrom(e.target.value)}
              className="flex-1 sm:flex-initial min-w-[140px] px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
            />
            <span className="text-ink-hush">—</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || minDate}
              max={today}
              onChange={e => setDateTo(e.target.value)}
              className="flex-1 sm:flex-initial min-w-[140px] px-2 py-1.5 border border-line rounded-lg bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
            />
          </div>
        </div>

        {/* Закупка на N дней — переехала из шапки (04.06.2026, Александр).
            Применяется той же кнопкой «Рассчитать» вместе со всеми параметрами. */}
        <div className="min-w-0">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-1.5">
            {t("sku.list.reorderFor")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={reorderDays}
              min={1}
              max={365}
              inputMode="numeric"
              onChange={e => setReorderDays(e.target.value)}
              className="w-16 sm:w-20 px-2 py-1.5 border border-line rounded-lg text-center bg-paper font-mono text-sm focus:outline-none focus:border-lime-deep min-h-[36px]"
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{t("unit.days.many")}</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 h-[15px]" aria-hidden />
          {/* 04.06.2026: active:scale-95 — визуальный эффект нажатия (просьба Александра).
              Класс transition уже анимирует transform — кнопка плавно «вжимается». */}
          <button
            type="button"
            onClick={onCalcClick}
            disabled={clearing}
            className="px-4 py-1.5 rounded-lg bg-ink text-paper font-mono text-xs uppercase tracking-wider font-semibold hover:bg-ink-soft active:scale-95 active:bg-ink-soft transition min-h-[36px] disabled:opacity-60"
          >
            {t("sku.filters.calc")}
          </button>
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
              <span>{t("sku.filters.includeInactive")}</span>
            </button>
            <InfoTooltip text={t("sku.filters.inactiveHint")} />
          </div>
        )}

        {/* Правка 10 (#1): «Стереть заметки» — деструктивный тумблер (оранжевый),
            всегда доступен; чистит все заметки селлера при «Рассчитать». */}
        <div className="flex items-center gap-2 pt-6">
          <button
            type="button"
            onClick={() => setEraseNotes((v) => !v)}
            className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition py-2 -my-2 min-h-[36px]"
          >
            <span className={`size-5 rounded border ${eraseNotes ? "bg-orange border-orange" : "bg-paper border-line"} flex items-center justify-center transition shrink-0`}>
              {eraseNotes && <span className="text-paper text-[11px]">✓</span>}
            </span>
            <span>{isEn ? "Erase notes" : "Стереть заметки"}</span>
          </button>
          <InfoTooltip
            text={
              isEn
                ? "On 'Calculate', deletes all your notes across every SKU. Off by default."
                : "При нажатии «Рассчитать» удаляет все ваши заметки по всем SKU. По умолчанию выключено."
            }
          />
        </div>
      </div>

      {minDate && (
        <p className="text-[11px] text-ink-hush font-mono">
          {t("sku.filters.dataSince", { date: new Date(minDate).toLocaleDateString("ru-RU") })}
        </p>
      )}
      <p className="text-[11px] text-ink-hush leading-relaxed">
        {t("sku.filters.periodHelp")}
      </p>
      </section>

      {/* METRIC FILTERS — 4 диапазонных фильтра отдельными карточками */}
      <section className="space-y-3 p-3 sm:p-4 rounded-xl border border-line bg-bg-soft">
        <SectionHeader label={t("sku.filters.section.metrics")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <RangeField
          label={t("sku.filters.stock.label")}
          hint={t("sku.filters.stock.hint")}
          minPlaceholder={String(ranges.stockMin)}
          maxPlaceholder={String(ranges.stockMax)}
          minVal={stockMin}
          maxVal={stockMax}
          onMinChange={setStockMin}
          onMaxChange={setStockMax}
        />
        <RangeField
          label={t("sku.filters.oos.label")}
          hint={t("sku.filters.oos.hint")}
          minPlaceholder={String(ranges.oosMin)}
          maxPlaceholder={String(ranges.oosMax)}
          minVal={oosMin}
          maxVal={oosMax}
          onMinChange={setOosMin}
          onMaxChange={setOosMax}
        />
        <RangeField
          label={t("sku.filters.lost.label")}
          hint={t("sku.filters.lost.hint")}
          minPlaceholder={Math.round(ranges.lostMin).toString()}
          maxPlaceholder={Math.round(ranges.lostMax).toString()}
          minVal={lostMin}
          maxVal={lostMax}
          onMinChange={setLostMin}
          onMaxChange={setLostMax}
        />
        {/* Новый фильтр (Александр 01.06.2026): "Дней до окончания остатков"
            по столбцу coverage_days. Очень важный для закупок. */}
        <RangeField
          label={t("sku.filters.coverage.label")}
          hint={t("sku.filters.coverage.hint")}
          minPlaceholder={String(ranges.coverageMin)}
          maxPlaceholder={String(ranges.coverageMax)}
          minVal={coverageMin}
          maxVal={coverageMax}
          onMinChange={setCoverageMin}
          onMaxChange={setCoverageMax}
        />
      </div>
      </section>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className="size-1 rounded-full bg-lime-deep" />
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lime-deep font-semibold">
        {label}
      </span>
    </div>
  );
}

function RangeField({
  label, hint, minVal, maxVal, onMinChange, onMaxChange,
  minPlaceholder = t("sku.filters.from"), maxPlaceholder = t("sku.filters.to"),
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
    <div className="rounded-lg border border-line bg-paper p-3">
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
