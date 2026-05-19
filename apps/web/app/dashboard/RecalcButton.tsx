"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

type RecalcStatus = "idle" | "running" | "done" | "error" | "unknown";

type Progress = {
  phase?: string;
  processed?: number;
  total?: number;
  period_days?: number;
  current_period_index?: number;
  total_periods?: number;
};

const PHASE_LABELS: Record<string, string> = {
  starting: "Старт",
  loading_products: "Загрузка SKU",
  processing_skus: "Анализ скоростей",
  writing_metrics: "Запись метрик",
  writing_store: "Сборка дашборда",
  done: "Готово",
};

export default function RecalcButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<RecalcStatus>("idle");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [modalError, setModalError] = useState<ParsedError | null>(null);
  // Ref чтобы не пересоздавать useEffect при каждой смене статуса
  // (иначе пересоздаются интервалы и сломается определение "переход idle → done" в тестах)
  const prevStatusRef = useRef<RecalcStatus>("idle");

  useEffect(() => {
    let cancelled = false;

    async function pollStatus() {
      try {
        const res = await fetch("/api/jobs/recalc/status", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const prev = prevStatusRef.current;
        prevStatusRef.current = data.status;
        setStatus(data.status);
        setProgress(data.progress ?? null);

        if (data.status === "done" && prev !== "done") {
          const r = data.result ?? {};
          setMsg(`Готово: ${r.metrics_written ?? 0} метрик, ${r.alerts_written ?? 0} алертов`);
          router.refresh();
        } else if (data.status === "error" && prev !== "error") {
          setModalError(parseApiError(data.error || "Расчёт упал", "Ошибка расчёта"));
        }
      } catch { /* ignore */ }
    }

    pollStatus();
    // Фиксированный интервал 8с — компромисс между живостью прогресса и нагрузкой на сервер.
    // Не зависим от status чтобы не пересоздавать таймеры на каждом ререндере (это ломало тесты).
    const interval = setInterval(pollStatus, 8000);
    return () => { cancelled = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Сообщение из ответа сервера — для всех случаев (started:true/false)
      if (data.message) {
        setMsg(data.message);
      }
      prevStatusRef.current = "running";
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

  // Общий процент для прогресс-бара.
  // Расчёт идёт по 3 периодам (7/30/90). Внутри периода: 5% loading → 65% processing → 25% writing_metrics → 5% writing_store.
  let percent: number | null = null;
  let detailLine: string | null = null;
  if (progress && status === "running") {
    const cpi = progress.current_period_index ?? 0;
    const tp = progress.total_periods ?? 3;
    const processedShare = (progress.total && progress.total > 0)
      ? Math.min(1, (progress.processed ?? 0) / progress.total)
      : 0;
    let phasePart = 0;
    if (progress.phase === "loading_products") phasePart = 0.05;
    else if (progress.phase === "processing_skus") phasePart = 0.05 + processedShare * 0.65;
    else if (progress.phase === "writing_metrics") phasePart = 0.7 + processedShare * 0.25;
    else if (progress.phase === "writing_store") phasePart = 0.97;
    else if (progress.phase === "done") phasePart = 1;
    const overall = ((Math.max(0, cpi - 1) + phasePart) / tp) * 100;
    percent = Math.max(2, Math.min(99, Math.round(overall)));

    const phaseLabel = PHASE_LABELS[progress.phase ?? ""] ?? "Расчёт";
    const periodLabel = progress.period_days ? `${progress.period_days}-дневный` : "";
    const counter = (progress.processed != null && progress.total)
      ? `${progress.processed}/${progress.total} SKU`
      : "";
    detailLine = [
      `${phaseLabel}${periodLabel ? ` · ${periodLabel} период` : ""}`,
      counter,
      (cpi && tp) ? `Период ${cpi}/${tp}` : "",
    ].filter(Boolean).join(" · ");
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1.5">
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
        {/* Прогресс-бар + детальная строка с процентами и счётчиком */}
        {status === "running" && progress && progress.total ? (
          <div className="w-full min-w-[280px] max-w-sm">
            <div className="h-1.5 w-full rounded-full bg-bg-soft overflow-hidden">
              <div
                className="h-full bg-azure transition-all duration-700 ease-out"
                style={{ width: `${percent ?? 5}%` }}
              />
            </div>
            <div className="mt-1 font-mono text-[10px] text-ink-hush flex justify-between gap-2">
              <span className="truncate">{detailLine}</span>
              <span className="shrink-0 tabular">{percent ?? "…"}%</span>
            </div>
          </div>
        ) : null}
        {msg && (
          <span className="text-xs text-lime-deep font-mono">{msg}</span>
        )}
      </div>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
