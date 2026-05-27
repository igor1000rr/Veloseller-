"use client";
import { useState } from "react";

export function AddBrandForm({ canAdd, brandsLeft }: { canAdd: boolean; brandsLeft: number }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/radar/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Не удалось добавить бренд");
      }
    } catch (e) {
      setError("Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  if (!canAdd) {
    return (
      <div className="rounded-xl border border-orange/30 bg-orange/5 p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-ink">
          <span className="font-mono text-[10px] uppercase tracking-widest text-orange font-semibold">Лимит достигнут</span>
          <p className="mt-1 text-ink-muted">Чтобы добавить больше брендов, обновите тариф Radar.</p>
        </div>
        <a href="/billing#radar" className="inline-flex items-center rounded-lg bg-ink text-paper px-4 py-2 text-sm font-medium hover:bg-ink-soft transition">
          Обновить тариф
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-line bg-paper p-4">
      <label className="block font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold mb-2">
        Добавить бренд вручную · осталось {brandsLeft}
      </label>
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Dyson"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-line bg-paper text-sm focus:border-lime-deep/40 outline-none transition"
          disabled={submitting}
        />
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="px-4 py-2 rounded-lg bg-ink text-paper text-sm font-medium hover:bg-ink-soft disabled:opacity-50 transition"
        >
          {submitting ? "Добавляю..." : "Добавить"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-rose">{error}</p>}
    </form>
  );
}
