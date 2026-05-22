"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Кнопка массового подтверждения алертов.
 *
 * Mobile-friendly:
 * - В режиме подтверждения на мобиле элементы стакают вертикально (вопрос сверху,
 *   кнопки Да/Отмена под ним), на десктопе остаются в строку.
 * - Размер шрифта поднял до text-xs (12px) — 10px было сложно прочитать на мобиле.
 * - Тач-таргеты py-1.5 → py-2 (~32px).
 */
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
        className="inline-flex items-center px-3 py-1.5 rounded border border-line bg-paper text-ink-muted hover:text-ink hover:border-lime-deep/40 text-xs font-mono uppercase tracking-wider transition min-h-[32px]"
      >
        Принять все
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-1.5">
      <span className="text-[11px] sm:text-[10px] text-ink-muted font-mono">
        Принять {count} {kindLabel ? `«${kindLabel}»` : "алертов"}?
      </span>
      <span className="inline-flex gap-1.5">
        <button
          onClick={doAck}
          disabled={busy}
          className="px-3 py-1.5 rounded bg-ink text-paper text-xs font-mono uppercase tracking-wider disabled:opacity-50 transition min-h-[32px]"
        >
          {busy ? "..." : "Да"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 rounded border border-line text-xs font-mono uppercase tracking-wider text-ink-muted hover:bg-bg-soft transition min-h-[32px]"
        >
          Отмена
        </button>
      </span>
    </span>
  );
}
