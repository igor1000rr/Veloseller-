"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorModal } from "../_components/ErrorModal";
import { parseApiError, type ParsedError } from "@/lib/error-parser";

export default function SyncButton({ connectionId, source }: { connectionId: string; source: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modalError, setModalError] = useState<ParsedError | null>(null);

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

  return (
    <>
      <button
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center px-4 py-2 rounded-lg border border-line bg-paper hover:border-lime-deep/40 text-ink text-sm font-semibold disabled:opacity-50 transition"
      >
        {loading ? "Синхронизация…" : "Синхронизировать"}
      </button>
      <ErrorModal error={modalError} onClose={() => setModalError(null)} />
    </>
  );
}
