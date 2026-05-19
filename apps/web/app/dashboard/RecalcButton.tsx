"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

type RecalcStatus = "idle" | "running" | "done" | "error" | "unknown";

export default function RecalcButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RecalcStatus>("idle");
  const [msg, setMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<ParsedError | null>(null);

  // При монтировании и периодически опрашиваем статус — если расчёт идёт в фоне,
  // покажем лабелу "Расчёт идёт…" даже если юзер его запустил в другой вкладке.
  useEffect(() => {
    let cancelled = false;

    async function pollStatus() {
      try {
        const res = await fetch("/api/jobs/recalc/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const prevStatus = status;
        setStatus(data.status);

        if (data.status === "running") {
          setMsg("Расчёт идёт в фоне…");
        } else if (data.status === "done" && prevStatus === "running") {
          // Расчёт только что завершился — обновляем данные
          const r = data.result ?? {};
          setMsg(`Готово: ${r.metrics_written ?? 0} метрик, ${r.alerts_written ?? 0} алертов`);
          router.refresh();
        } else if (data.status === "error" && prevStatus === "running") {
          setModalError(parseApiError(data.error || "Расчёт упал", "Ошибка расчёта"));
        }
      } catch {
        // тихо игнорируем ошибки polling
      }
    }

    // Первый опрос сразу, потом каждые 8с
    pollStatus();
    const interval = setInterval(pollStatus, 8000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [status, router]);

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
      if (data.started === false && data.status === "running") {
        setMsg("Расчёт уже идёт…");
      } else {
        setMsg(data.message ?? "Расчёт запущен");
      }
      setStatus("running");
    } catch (e: any) {
      setModalError(parseApiError(e?.message || "Network error", "Не удалось связаться с сервером"));
    } finally {
      setBusy(false);
    }
  }

  const isRunning = busy || status === "running";
  const label = busy
    ? "Считаем…"
    : status === "running"
      ? "Расчёт идёт…"
      : "Пересчитать сейчас";

  return (
    <>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onClick}
          disabled={isRunning}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-line bg-paper hover:bg-bg-soft text-ink-soft text-sm font-mono uppercase tracking-wider disabled:opacity-60 transition"
          title="Пересчитать метрики и алерты"
        >
          {status === "running" && (
            <span className="size-2 rounded-full bg-azure animate-pulse" />
          )}
          {label}
        </button>
        {msg && (
          <span className={`text-xs font-mono ${status === "running" ? "text-azure" : "text-lime-deep"}`}>
            {msg}
          </span>
        )}
      </div>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
