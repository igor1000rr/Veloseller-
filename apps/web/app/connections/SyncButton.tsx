"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

// БАГ 87: интервалы polling'а статуса после fire-and-forget sync.
// Sync 1879 SKU занимает 60-90с, 10K SKU — до 5-6 минут.
// Поллим раз в 4с, максимум 8 минут.
const POLL_INTERVAL_MS = 4_000;
const POLL_TIMEOUT_MS = 480_000;

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

  useEffect(() => stopPolling, []);

  function startPolling() {
    setPolling(true);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/connections/${connectionId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== "syncing") {
          stopPolling();
          router.refresh();
        }
      } catch {
        // network errors при polling'е игнорируем
      }
    }, POLL_INTERVAL_MS);
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
      router.refresh();
      startPolling();
    } catch (e: any) {
      setModalError(parseApiError(e?.message || String(e), "Не удалось связаться с сервером"));
    } finally {
      setLoading(false);
    }
  }

  if (source === "csv_upload") {
    return <span className="text-sm text-ink-hush font-mono">только через загрузку CSV</span>;
  }

  // Лейбл: loading (отправляем запрос) → "Синхронизация…"
  //        polling (ждём BG в worker'е) → "Идёт синхронизация…"
  //        idle → "Синхронизировать"
  const label = polling ? "Идёт синхронизация…" : (loading ? "Синхронизация…" : "Синхронизировать");
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
