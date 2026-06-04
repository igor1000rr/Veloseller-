"use client";

import { useState } from "react";
import { PAYMENT_PROVIDER } from "@/lib/features";
import { t } from "@/lib/i18n";

const CONTACT_EMAIL = "info@proaim.ru";

/**
 * Кнопка «Купить тариф».
 *
 * РФ (PAYMENT_PROVIDER=robokassa, дефолт): редирект на Robokassa (рублёвые платежи).
 * .com (PAYMENT_PROVIDER=stub): онлайн-оплаты ещё нет — кнопка ведёт на mailto,
 * тариф активируем вручную. Международный эквайринг (Paddle/Stripe) — отдельная фаза.
 * Stripe endpoints остаются в коде как задел.
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
      setErrorMsg(data.error || t("billing.err.createPayment"));
    } catch (e: any) {
      setErrorMsg(e?.message || t("billing.err.network"));
    } finally {
      setBusy(false);
    }
  }

  if (isCurrent) {
    return (
      <button disabled className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-slate-200 text-slate-500">
        {t("billing.btn.current")}
      </button>
    );
  }
  if (PAYMENT_PROVIDER === "stub") {
    return (
      <a
        href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Veloseller plan: ${plan}`)}`}
        className="mt-6 block w-full py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white text-center"
      >
        {t("billing.btn.contact")}
      </a>
    );
  }
  return (
    <>
      <button onClick={handleUpgrade} disabled={busy}
              className="mt-6 w-full py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white">
        {busy ? t("billing.btn.busy") : label}
      </button>
      {errorMsg && (
        <p className="mt-2 text-xs text-rose-600">{errorMsg}</p>
      )}
    </>
  );
}

/**
 * Кнопка «Управление подпиской» — в Robokassa нет customer portal,
 * подписка это разовые платежи раз в 30 дней. На stub-провайдере (.com)
 * продление тоже вручную — через письмо.
 */
export function ManageSubscriptionButton() {
  return (
    <span className="text-sm text-slate-500">
      {t(PAYMENT_PROVIDER === "stub" ? "billing.manageNoteStub" : "billing.manageNote")}
    </span>
  );
}
