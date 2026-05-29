"use client";
import { useState, useTransition } from "react";
import { actionAddBrandManual, actionAddBrandsBulkManual } from "../actions";

/**
 * Форма добавления брендов руками. Два режима:
 * - "single" — один бренд, кнопка/Enter (для быстрого добавления)
 * - "bulk"   — textarea со списком, разделители \n,;\t (для готового списка)
 *
 * Полезно как fallback пока DeepSeek_API_KEY не настроен или для селлеров
 * у которых нет прайса в Excel — только список марок в голове.
 */
export default function AddBrandForm({ limitReached }: { limitReached: boolean }) {
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Live preview для bulk режима — сколько уникальных распознано
  const bulkPreviewCount = bulk
    ? new Set(
        bulk.split(/[\n,;\t]+/)
          .map(s => s.trim().toLowerCase().replace(/\s+/g, " "))
          .filter(s => s.length >= 2 && s.length <= 60),
      ).size
    : 0;

  const submitSingle = () => {
    if (!single.trim()) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await actionAddBrandManual(single);
        setSingle("");
        setSuccess("Бренд добавлен");
      } catch (e: any) {
        setError(e.message ?? "Ошибка");
      }
    });
  };

  const submitBulk = () => {
    if (!bulk.trim()) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await actionAddBrandsBulkManual(bulk);
        setBulk("");
        const parts = [];
        if (res.added > 0) parts.push(`добавлено ${res.added}`);
        if (res.skipped > 0) parts.push(`пропущено ${res.skipped} (уже были)`);
        setSuccess(parts.join(", ") || "Готово");
      } catch (e: any) {
        setError(e.message ?? "Ошибка");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">
          Добавить бренды руками
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => { setMode("single"); setError(null); setSuccess(null); }}
            className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded transition ${
              mode === "single" ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"
            }`}
          >
            По одному
          </button>
          <button
            type="button"
            onClick={() => { setMode("bulk"); setError(null); setSuccess(null); }}
            className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 rounded transition ${
              mode === "bulk" ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"
            }`}
          >
            Списком
          </button>
        </div>
      </div>

      {mode === "single" ? (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={single}
            onChange={e => setSingle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") submitSingle(); }}
            placeholder="Например: Dyson"
            disabled={limitReached || pending}
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-line bg-paper text-sm focus:outline-none focus:border-lime-deep/60 disabled:bg-bg-soft disabled:cursor-not-allowed"
          />
          <button
            onClick={submitSingle}
            disabled={!single.trim() || limitReached || pending}
            className="px-4 py-2 rounded-lg bg-ink text-paper text-sm font-mono uppercase tracking-wider font-semibold hover:bg-ink-soft disabled:opacity-40 transition"
          >
            {pending ? "..." : "Добавить"}
          </button>
        </div>
      ) : (
        <>
          <textarea
            value={bulk}
            onChange={e => setBulk(e.target.value)}
            placeholder={"Dyson\nBosch, Samsung; Apple\nXiaomi\nPhilips"}
            disabled={limitReached || pending}
            rows={5}
            className="w-full px-3 py-2 rounded-lg border border-line bg-paper text-sm font-mono focus:outline-none focus:border-lime-deep/60 disabled:bg-bg-soft disabled:cursor-not-allowed resize-y min-h-[110px]"
          />
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-ink-hush">
              Разделители: новая строка, запятая, точка с запятой.
              {bulkPreviewCount > 0 && (
                <span className="ml-2 text-ink-soft font-mono">Распознано: <span className="font-semibold">{bulkPreviewCount}</span></span>
              )}
            </p>
            <button
              onClick={submitBulk}
              disabled={!bulk.trim() || limitReached || pending || bulkPreviewCount === 0}
              className="px-4 py-2 rounded-lg bg-ink text-paper text-sm font-mono uppercase tracking-wider font-semibold hover:bg-ink-soft disabled:opacity-40 transition"
            >
              {pending ? "Добавляем…" : `Добавить ${bulkPreviewCount || ""}`}
            </button>
          </div>
        </>
      )}

      {limitReached && (
        <p className="mt-2 text-xs text-orange">
          Достигнут лимит брендов тарифа. Перейдите на старший тариф или исключите часть брендов.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-rose">{error}</p>}
      {success && <p className="mt-2 text-xs text-lime-deep">{success}</p>}
    </div>
  );
}
