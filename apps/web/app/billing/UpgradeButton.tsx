"use client";

import { useState } from "react";

export function UpgradeButton({ plan, isCurrent, label }: { plan: string; isCurrent: boolean; label: string }) {
  const [busy, setBusy] = useState(false);

  async function handleUpgrade() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  if (isCurrent) {
    return (
      <button disabled className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-500">
        Используется
      </button>
    );
  }
  return (
    <button onClick={handleUpgrade} disabled={busy}
            className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white">
      {busy ? "Открываем Stripe…" : label}
    </button>
  );
}

export function ManageSubscriptionButton() {
  const [busy, setBusy] = useState(false);
  async function handleManage() {
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert(data.error || "Ошибка");
    } finally { setBusy(false); }
  }
  return (
    <button onClick={handleManage} disabled={busy}
            className="text-sm text-violet-700 hover:text-violet-900 font-medium">
      {busy ? "..." : "Управление подпиской →"}
    </button>
  );
}
