"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type WarehouseOpt = { id: string; name: string; kindLabel: string };

export function CostImportForm({
  warehouses,
  defaultWarehouseId,
}: {
  warehouses: WarehouseOpt[];
  defaultWarehouseId: string;
}) {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId);
  const [file, setFile] = useState<File | null>(null);
  const [articleCol, setArticleCol] = useState("");
  const [costCol, setCostCol] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ matched: number; totalRows: number; unmatched: number } | null>(null);

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
