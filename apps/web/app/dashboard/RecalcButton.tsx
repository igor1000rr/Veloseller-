"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RecalcButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/jobs/recalc", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Ошибка: ${data.error ?? res.statusText}`);
      } else {
        setMsg(`Готово: ${data.metrics_written} метрик, ${data.alerts_written} алертов`);
        router.refresh();
      }
    } catch (e: any) {
      setMsg(`Ошибка: ${e.message}`);
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handle}
        disabled={busy}
        className="rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2"
      >
        {busy ? "Считаем…" : "Пересчитать сейчас"}
      </button>
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </div>
  );
}
