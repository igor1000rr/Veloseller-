"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
      className="text-xs text-slate-500 hover:text-teal-700 disabled:opacity-50"
      title="Отметить прочитанным"
    >
      {busy ? "…" : "Прочитано"}
    </button>
  );
}
