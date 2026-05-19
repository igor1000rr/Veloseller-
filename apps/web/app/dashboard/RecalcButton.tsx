"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

export default function RecalcButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<ParsedError | null>(null);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    setModalError(null);
    try {
      const res = await fetch("/api/jobs/recalc", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModalError(parseApiError(data, "Не удалось пересчитать"));
        return;
      }
      const data = await res.json();
      setMsg(`Готово: ${data.metrics_written ?? 0} метрик, ${data.alerts_written ?? 0} алертов`);
      // Форсим перезапрос всех server components — свежие метрики в dashboard сразу
      router.refresh();
    } catch (e: any) {
      setModalError(parseApiError(e?.message || "Network error", "Не удалось связаться с сервером"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={onClick}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line bg-paper hover:bg-bg-soft text-ink-soft text-sm font-mono uppercase tracking-wider disabled:opacity-50 transition"
          title="Пересчитать метрики и алерты"
        >
          {busy ? "Считаем…" : "Пересчитать сейчас"}
        </button>
        {msg && <span className="text-xs text-lime-deep font-mono">{msg}</span>}
      </div>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
