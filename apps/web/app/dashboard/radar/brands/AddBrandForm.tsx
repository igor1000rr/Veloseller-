"use client";
import { useState, useTransition } from "react";
import { actionAddBrandManual } from "../actions";

/**
 * Простая форма добавления одного бренда руками.
 *
 * Раньше тут был bulk-add textarea, но Александр 29.05.2026 указал
 * что общий список из 50 брендов не нужен (см. UntrackedBrandsTeaser
 * на /dashboard/radar — там реализована правильная FOMO-механика).
 * Селлер вводит бренды по одному, лимит тарифа выкручивает upgrade.
 */
export default function AddBrandForm({ limitReached }: { limitReached: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!value.trim()) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await actionAddBrandManual(value);
        setValue("");
        setSuccess("Бренд добавлен");
      } catch (e: any) {
        setError(e.message ?? "Ошибка");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-2">
        Добавить бренд руками
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="Например: Dyson"
          disabled={limitReached || pending}
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-line bg-paper text-sm focus:outline-none focus:border-lime-deep/60 disabled:bg-bg-soft disabled:cursor-not-allowed"
        />
        <button
          onClick={submit}
          disabled={!value.trim() || limitReached || pending}
          className="px-4 py-2 rounded-lg bg-ink text-paper text-sm font-mono uppercase tracking-wider font-semibold hover:bg-ink-soft disabled:opacity-40 transition"
        >
          {pending ? "..." : "Добавить"}
        </button>
      </div>
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
