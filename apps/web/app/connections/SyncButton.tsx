"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncButton({ connectionId, source }: { connectionId: string; source: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSync() {
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${connectionId}/sync`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Ошибка синка: ${data.error ?? res.statusText}`);
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // Для csv_upload синк через кнопку не нужен — данные загружаются через форму
  if (source === "csv_upload") {
    return <span className="text-sm text-slate-500">только через загрузку CSV</span>;
  }

  return (
    <button
      onClick={handleSync}
      disabled={loading}
      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-brand-600 hover:text-brand-700 disabled:opacity-50"
    >
      {loading ? "Синхронизация…" : "Синхронизировать"}
    </button>
  );
}
