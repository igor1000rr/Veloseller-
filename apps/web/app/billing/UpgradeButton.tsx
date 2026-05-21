"use client";

import { useState } from "react";

/**
 * Кнопка «Купить тариф» — перенаправляет на Robokassa.
 *
 * Раньше вела на Stripe Checkout, теперь на Robokassa (рублевые платежи для РФ).
 * Stripe endpoints остаются в коде как fallback для зарубежных клиентов (будет
 * отдельная кнопка «Оплатить картой (USD)» позже).
 */
export function UpgradeButton({ plan, isCurrent, label }: { plan: string; isCurrent: boolean; label: string }) {
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleUpgrade() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/robokassa/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setErrorMsg(data.error || "Не удалось создать платёж");
    } catch (e: any) {
      setErrorMsg(e?.message || "Ошибка сети");
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
    <>
      <button onClick={handleUpgrade} disabled={busy}
              className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white">
        {busy ? "Переходим на Робокассу…" : label}
      </button>
      {errorMsg && (
        <p className="mt-2 text-xs text-rose-600">{errorMsg}</p>
      )}
    </>
  );
}

/**
 * Кнопка «Управление подпиской» — в Robokassa нет customer portal,
 * подписка это разовые платежи раз в 30 дней. Поэтому просто
 * показываем текст "Продлить в следующем месяце — выберите тариф повторно".
 */
export function ManageSubscriptionButton() {
  return (
    <span className="text-sm text-slate-500">
      Подписка продлевается вручную: выберите тариф повторно, когда истекает 30 дней.
    </span>
  );
}
