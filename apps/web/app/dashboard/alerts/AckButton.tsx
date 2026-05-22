"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Кнопка подтверждения одиночного алерта.
 *
 * Mobile-friendly:
 * - Нормальный padding + border — видимая как кнопка, не просто ссылка.
 * - min-h-[32px] для тача.
 * - whitespace-nowrap чтобы не переносилось.
 * - Палитра приведена к ремским токенам (были slate-500/teal-700 из старого дизайна).
 */
export default function AckButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function handle() {
    setBusy(true);
    const res = await fetch(`/api/alerts/${id}/ack`, { method: "POST" });
    setBusy(false);
    if (res.ok) startTransition(() => router.refresh());
  }

  return (
    <button
      onClick={handle}
      disabled={busy}
      className="inline-flex items-center px-2.5 py-1.5 rounded border border-line bg-paper text-xs font-mono text-ink-muted hover:text-ink hover:border-lime-deep/40 disabled:opacity-50 transition min-h-[32px] whitespace-nowrap"
      title="Отметить прочитанным"
    >
      {busy ? "…" : "Принять"}
    </button>
  );
}
