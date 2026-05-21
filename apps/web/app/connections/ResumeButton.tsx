"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

/**
 * Кнопка "Возобновить sync" для paused-складов.
 *
 * Появляется когда worker поставил status='paused' из-за 3+ неудач подряд.
 * Сбрасывает failure_count=0, status='pending'. Следующий sync работает как обычно.
 */
export default function ResumeButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState<ParsedError | null>(null);

  async function handleResume() {
    setLoading(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/connections/${connectionId}/resume`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setModalError(parseApiError(data, "Не удалось снять паузу"));
        return;
      }
      router.refresh();
    } catch (e: any) {
      setModalError(parseApiError(e?.message || String(e), "Не удалось связаться с сервером"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleResume}
        disabled={loading}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-orange/40 bg-orange/10 hover:bg-orange/15 text-orange text-sm font-semibold disabled:opacity-50 transition"
        title="Снять авто-паузу и разрешить следующую попытку sync"
      >
        {loading ? "Снимаем паузу…" : "Возобновить sync"}
      </button>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
