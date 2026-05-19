"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RecalcButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/jobs/recalc", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMsg(`Ошибка: ${data.error ?? res.statusText}`);
        return;
      }
      const data = await res.json();
      setMsg(`Готово: ${data.metrics_written ?? 0} метрик, ${data.alerts_written ?? 0} алертов`);
      // Форсим перезапрос всех server components — свежие метрики/алерты в dashboard сразу
      router.refresh();
    } catch (e: any) {
      setMsg(`Ошибка: ${e?.message || "Network error"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line bg-paper hover:bg-bg-soft text-ink-soft text-sm font-mono uppercase tracking-wider disabled:opacity-50 transition"
        title="Пересчитать метрики и алерты"
      >
        {busy ? "Считаем…" : "Пересчитать сейчас"}
      </button>
      {msg && <span className="text-xs text-ink-muted font-mono">{msg}</span>}
    </div>
  );
}
