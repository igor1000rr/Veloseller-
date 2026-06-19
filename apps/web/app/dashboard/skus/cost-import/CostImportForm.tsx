"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSellerTaxRate } from "../actions";

type WarehouseOpt = { id: string; name: string; kindLabel: string };

export function CostImportForm({
  warehouses,
  defaultWarehouseId,
  defaultTaxRate,
}: {
  warehouses: WarehouseOpt[];
  defaultWarehouseId: string;
  defaultTaxRate: number | null;
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [file, setFile] = useState<File | null>(null);
  const [articleCol, setArticleCol] = useState("");
  const [costCol, setCostCol] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: number; totalRows: number; unmatched: number } | null>(null);

  // Ставка налога — уровень кабинета (sellers.tax_rate), не привязана к складу.
  const [taxRate, setTaxRate] = useState(defaultTaxRate != null ? String(defaultTaxRate) : "");
  const [taxPending, setTaxPending] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const [taxSaved, setTaxSaved] = useState(false);

  const canSubmit = !!file && !!articleCol.trim() && !!costCol.trim() && !pending;

  const submit = async () => {
    if (!canSubmit || !file) return;
    setPending(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    form.append("connection_id", warehouseId);
    form.append("article_col", articleCol.trim());
    form.append("cost_col", costCol.trim());
    try {
      const res = await fetch("/api/cost-prices/import", { method: "POST", body: form });
      const body = await res.json().catch(() => ({ error: "unknown" }));
      if (!res.ok) {
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult({
        matched: body.matched ?? 0,
        totalRows: body.totalRows ?? 0,
        unmatched: body.unmatched ?? 0,
      });
      // Обновляем серверные данные (карточки товаров теперь с себестоимостью).
      router.refresh();
    } catch {
      setError("Ошибка соединения");
    } finally {
      setPending(false);
    }
  };

  // Применить ставку налога ко всему кабинету (sellers.tax_rate) — с подтверждением.
  const applyTax = async () => {
    const trimmed = taxRate.trim();
    let parsed: number | null = null;
    if (trimmed !== "") {
      const v = parseFloat(trimmed.replace(",", "."));
      if (!isFinite(v) || v < 0 || v > 100) { setTaxError("Ставка должна быть числом от 0 до 100"); return; }
      parsed = v;
    }
    const label = parsed != null ? `${parsed}%` : "пустое значение (сбросить ставку)";
    if (!window.confirm(`Применить ставку налога ${label} ко всем товарам кабинета? Она станет дефолтной в юнит-экономике.`)) return;
    setTaxPending(true);
    setTaxError(null);
    setTaxSaved(false);
    const res = await saveSellerTaxRate(parsed);
    setTaxPending(false);
    if (res.ok) { setTaxSaved(true); router.refresh(); }
    else { setTaxError(res.error ?? "Не удалось сохранить"); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6 space-y-4">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Склад</span>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:border-lime-deep"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.kindLabel}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Файл</span>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
            className="mt-1.5 block w-full text-sm text-ink-muted file:mr-4 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-ink file:text-paper file:font-mono file:uppercase file:text-xs file:tracking-wider file:font-semibold hover:file:bg-ink-soft cursor-pointer"
          />
          {file && (
            <div className="mt-2 text-xs font-mono text-ink-hush">
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
          <p className="mt-2 text-xs text-ink-hush leading-relaxed">
            Формат: CSV (UTF-8) или XLSX. До 50 МБ. Сопоставим товары по артикулу
            и добавим себестоимость в карточку.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Столбец с артикулами</span>
            <input
              type="text"
              value={articleCol}
              onChange={(e) => setArticleCol(e.target.value)}
              placeholder="Например D"
              className="mt-1.5 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus:border-lime-deep"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Столбец с себестоимостью</span>
            <input
              type="text"
              value={costCol}
              onChange={(e) => setCostCol(e.target.value)}
              placeholder="Например F"
              className="mt-1.5 block w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:outline-none focus:border-lime-deep"
            />
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center rounded-lg bg-lime-deep text-paper px-5 py-2.5 text-sm font-mono uppercase tracking-wider font-semibold hover:bg-lime-deep/90 disabled:opacity-40 transition"
          >
            {pending ? "Обработка…" : "Добавить себестоимость"}
          </button>
          {error && <span className="text-xs text-rose">{error}</span>}
        </div>
      </div>

      {/* Ставка налога — отдельный блок: налоговый режим один на кабинет (УСН/ОСН),
          не зависит от выбранного склада. С подтверждением применяется ко всем
          товарам кабинета и становится дефолтом в блоке Юнит-экономика. */}
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="font-display text-lg font-medium text-ink">Ставка налога</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Один процент на весь кабинет (например, УСН 6%). Станет дефолтом в
            юнит-экономике по всем товарам. Себестоимость и комиссию не меняет.
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">Ставка, %</span>
            <div className="mt-1.5 flex items-center rounded-lg border border-line bg-paper overflow-hidden focus-within:border-lime-deep">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={taxRate}
                onChange={(e) => { setTaxRate(e.target.value); setTaxSaved(false); setTaxError(null); }}
                placeholder="Например 6"
                className="w-28 bg-transparent px-3 py-2 font-mono text-sm text-ink outline-none"
              />
              <span className="px-2 text-ink-hush font-mono text-sm select-none">%</span>
            </div>
          </label>
          <button
            onClick={applyTax}
            disabled={taxPending}
            className="inline-flex items-center rounded-lg bg-ink text-paper px-5 py-2.5 text-sm font-mono uppercase tracking-wider font-semibold hover:bg-ink-soft disabled:opacity-40 transition"
          >
            {taxPending ? "Сохранение…" : "Применить ко всем товарам кабинета"}
          </button>
        </div>
        {taxError && <span className="block text-xs text-rose">{taxError}</span>}
        {taxSaved && <span className="block text-xs font-mono text-lime-deep">✓ Ставка налога применена ко всему кабинету</span>}
      </div>

      {result && (
        <div className="rounded-2xl border border-lime-deep/40 bg-lime-soft p-5">
          <div className="font-display text-lg font-medium text-ink">
            Сопоставлено: {result.matched} товаров
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Строк в файле: {result.totalRows}
            {result.unmatched > 0 && <> · не найдено на складе: {result.unmatched}</>}
          </p>
        </div>
      )}
    </div>
  );
}
