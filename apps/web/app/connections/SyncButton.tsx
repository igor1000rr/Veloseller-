"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

// БАГ 87: интервалы polling'а статуса после fire-and-forget sync.
// Sync 1879 SKU занимает 60-90с. Поллим раз в 4с, максимум 3 минуты.
const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 180_000;

export default function SyncButton({ connectionId, source }: { connectionId: string; source: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [modalError, setModalError] = useState<ParsedError | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    if (pollTimeout.current) { clearTimeout(pollTimeout.current); pollTimeout.current = null; }
    setPolling(false);
  }

  // Cleanup при unmount
  useEffect(() => stopPolling, []);

  function startPolling() {
    setPolling(true);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/connections/${connectionId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        // Когда статус сменился со syncing на active или error — обновляем страницу
        if (data.status !== "syncing") {
          stopPolling();
          router.refresh();
        }
      } catch {
        // network errors при polling'е игнорируем — следующая попытка может пройти
      }
    }, POLL_INTERVAL_MS);
    // Safety: если sync завис на 3 минуты, перестаём поллить и обновляем страницу
    pollTimeout.current = setTimeout(() => {
      stopPolling();
      router.refresh();
    }, POLL_TIMEOUT_MS);
  }

  async function handleSync() {
    setLoading(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}/sync`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModalError(parseApiError(data, "Ошибка синхронизации"));
        return;
      }
      // БАГ 85 + БАГ 87: sync теперь fire-and-forget, нужен polling статуса
      router.refresh();
      startPolling();
    } catch (e: any) {
      setModalError(parseApiError(e?.message || String(e), "Не удалось связаться с сервером"));
    } finally {
      setLoading(false);
    }
  }

  // Для csv_upload синк через кнопку не нужен — данные загружаются через форму
  if (source === "csv_upload") {
    return <span className="text-sm text-ink-hush font-mono">только через загрузку CSV</span>;
  }

  const label = polling ? "Идёт синхронизация…" : (loading ? "Запуск…" : "Синхронизировать");
  return (
    <>
      <button
        onClick={handleSync}
        disabled={loading || polling}
        className="inline-flex items-center px-4 py-2 rounded-lg border border-line bg-paper hover:border-lime-deep/40 text-ink text-sm font-semibold disabled:opacity-50 transition"
      >
        {label}
      </button>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
