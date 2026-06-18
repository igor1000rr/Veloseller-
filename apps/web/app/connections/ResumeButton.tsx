"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";
import { t } from "@/lib/i18n";

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
        setModalError(parseApiError(data, t("connections.resume.err")));
        return;
      }
      router.refresh();
    } catch (e: any) {
      setModalError(parseApiError(e?.message || String(e), t("connections.sync.errNetwork")));
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
        title={t("connections.resume.title")}
      >
        {loading ? t("connections.resume.busy") : t("connections.resumeSync")}
      </button>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
