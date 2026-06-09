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

type Props = {
  connectionId: string;
  source: string;
  warehouseKind?: string | null;
  marketplace?: string | null;
  lastError?: string | null;
  lastSyncAt?: string | null;
};

// Кулдаун между ручными синками — защита от спама и от rate-limit маркетплейса.
// WB Statistics API (/supplier/stocks) разрешает ~1 запрос в минуту НА АККАУНТ,
// причём FBO и FBS делят один лимит — поэтому окно с запасом (90с).
// У Ozon лимиты мягче. Несколько нажатий подряд только продлевают бан WB.
function cooldownMsFor(warehouseKind?: string | null, marketplace?: string | null): number {
  const wb = warehouseKind === "wb_fbo" || warehouseKind === "wb_fbs" || marketplace === "wildberries";
  const ozon = warehouseKind === "ozon_fbo" || warehouseKind === "ozon_fbs" || marketplace === "ozon";
  if (wb) return 90_000;
  if (ozon) return 25_000;
  return 15_000;
}

export default function SyncButton({ connectionId, source, warehouseKind, marketplace, lastError, lastSyncAt }: Props) {
  const router = useRouter();
  const COOLDOWN_MS = cooldownMsFor(warehouseKind, marketplace);

  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [modalError, setModalError] = useState<ParsedError | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [nowTs, setNowTs] = useState(0);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    if (pollTimeout.current) { clearTimeout(pollTimeout.current); pollTimeout.current = null; }
    setPolling(false);
  }

  useEffect(() => stopPolling, []);

  // Начальный кулдаун считаем ПОСЛЕ маунта (не в useState-инициализаторе),
  // иначе Date.now() на сервере и клиенте разойдётся → hydration mismatch.
  // Если последний синк только что упал по rate-limit — досиживаем окно даже
  // после перезагрузки страницы.
  useEffect(() => {
    if (!lastError || !lastSyncAt) return;
    if (parseApiError(lastError).kind !== "rate_limit") return;
    const last = new Date(lastSyncAt).getTime();
    if (!last || Number.isNaN(last)) return;
    const until = last + COOLDOWN_MS;
    if (until > Date.now()) {
      setCooldownUntil(until);
      setNowTs(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Тикаем раз в секунду, пока идёт кулдаун — для обратного отсчёта.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => {
      const tnow = Date.now();
      setNowTs(tnow);
      if (tnow >= cooldownUntil) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  function startCooldown() {
    setCooldownUntil(Date.now() + COOLDOWN_MS);
    setNowTs(Date.now());
  }

  function startPolling() {
    setPolling(true);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/connections/${connectionId}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== "syncing") {
          stopPolling();
          startCooldown();
          router.refresh();
        }
      } catch {
        // network errors при polling'е игнорируем
      }
    }, POLL_INTERVAL_MS);
    pollTimeout.current = setTimeout(() => {
      stopPolling();
      startCooldown();
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
        startCooldown();
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

  const remainingMs = Math.max(0, cooldownUntil - nowTs);
  const cooling = remainingMs > 0 && !polling && !loading;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const isWb = warehouseKind === "wb_fbo" || warehouseKind === "wb_fbs" || marketplace === "wildberries";

  // Лейбл: loading → "Синхронизация…"; polling → "Идёт синхронизация…";
  //        cooling → обратный отсчёт; idle → "Синхронизировать".
  const label = polling
    ? "Идёт синхронизация…"
    : loading
    ? "Синхронизация…"
    : cooling
    ? `Подождите ${remainingSec} с`
    : "Синхронизировать";

  const coolTitle = isWb
    ? "Wildberries обновляет данные примерно раз в минуту — дождитесь окончания отсчёта"
    : "Защита от слишком частых запросов — дождитесь окончания отсчёта";

  return (
    <>
      <button
        onClick={handleSync}
        disabled={loading || polling || cooling}
        title={cooling ? coolTitle : undefined}
        className="inline-flex items-center px-4 py-2 rounded-lg border border-line bg-paper hover:border-lime-deep/40 text-ink text-sm font-semibold disabled:opacity-50 transition"
      >
        {label}
      </button>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
