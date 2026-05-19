"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BulkAckButton({
  kind,
  count,
  kindLabel,
}: {
  kind?: string;
  count: number;
  kindLabel?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doAck() {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts/bulk-ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind ? { kind } : {}),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center px-2.5 py-1 rounded border border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40 text-[10px] font-mono uppercase tracking-wider transition"
      >
        Принять все
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] text-ink-muted font-mono">
        Принять {count} {kindLabel ? `«${kindLabel}»` : "алертов"}?
      </span>
      <button
        onClick={doAck}
        disabled={busy}
        className="px-2 py-0.5 rounded bg-ink text-paper text-[10px] font-mono uppercase tracking-wider disabled:opacity-50 transition"
      >
        {busy ? "..." : "Да"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="px-2 py-0.5 rounded border border-line text-[10px] font-mono uppercase tracking-wider text-ink-muted hover:bg-bg-soft transition"
      >
        Отмена
      </button>
    </span>
  );
}
