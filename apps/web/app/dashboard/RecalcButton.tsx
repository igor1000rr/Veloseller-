"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../_components/Icons";

export default function RecalcButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs/recalc", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Ошибка: ${res.status}`);
        return;
      }
      // Форсим перезапрос всех server components — свежие метрики в dashboard сразу
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line bg-paper hover:bg-bg-soft text-ink-soft text-sm font-mono uppercase tracking-wider disabled:opacity-50 transition"
        title="Пересчитать метрики и алерты"
      >
        <Icons.Refresh size={12} className={busy ? "animate-spin" : ""} />
        <span>{busy ? "Считаю…" : "Пересчёт"}</span>
      </button>
      {error && <span className="text-xs text-rose font-mono">{error}</span>}
    </div>
  );
}
