"use client";

import { useState } from "react";
import {
  CUSTOM_WAREHOUSES_MIN,
  CUSTOM_WAREHOUSES_MAX,
  CUSTOM_SKU_MIN,
  CUSTOM_SKU_MAX,
  CUSTOM_SKU_STEP,
  customPlanPrice,
  customPlanId,
  parseCustomPlanId,
} from "@/lib/custom-plan";
import { formatPlanPrice } from "@/lib/plans";
import { t } from "@/lib/i18n";

const WAREHOUSE_OPTIONS = Array.from(
  { length: CUSTOM_WAREHOUSES_MAX - CUSTOM_WAREHOUSES_MIN + 1 },
  (_, i) => CUSTOM_WAREHOUSES_MIN + i,
);
const SKU_OPTIONS = Array.from(
  { length: (CUSTOM_SKU_MAX - CUSTOM_SKU_MIN) / CUSTOM_SKU_STEP + 1 },
  (_, i) => CUSTOM_SKU_MIN + i * CUSTOM_SKU_STEP,
);

/**
 * Карточка «Конструктор» на /billing (Александр 04.06.2026).
 *
 * Два выпадающих меню: склады 1–20 и SKU/склад 1000–20000 (шаг 1000).
 * Цена пересчитывается живьём: склад 1000 ₽ + каждые 1000 SKU — 500 ₽.
 * Оплата — тем же флоу, что фикс-тарифы: POST /api/robokassa/create-payment
 * с plan=custom_{wh}x{sku}; сумму сервер считает сам из кодировки.
 *
 * Рендерится только при PAYMENT_PROVIDER=robokassa (условие в billing/page.tsx).
 */
export function PlanBuilder({ currentPlan }: { currentPlan: string }) {
  const current = parseCustomPlanId(currentPlan);
  const [warehouses, setWarehouses] = useState(current?.warehouses ?? 5);
  const [skuPerWarehouse, setSkuPerWarehouse] = useState(current?.skuPerWarehouse ?? 2000);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const params = { warehouses, skuPerWarehouse };
  const price = customPlanPrice(params);
  const planId = customPlanId(params);
  const isCurrentCustom = current !== null;
  const isExactCurrent = planId === currentPlan;

  async function handleBuy() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/robokassa/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
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

  return (
    <div className={`rounded-2xl border p-6 transition ${
      isCurrentCustom ? "border-2 border-lime-deep bg-lime-soft" : "border-line bg-paper hover:shadow-sm hover:border-lime-deep/30"
    }`}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-lg font-medium text-ink">{t("billing.builder.title")}</h3>
        {isCurrentCustom && <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 bg-ink text-paper rounded font-semibold">{t("billing.activeBadge")}</span>}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{t("billing.builder.sub")}</p>

      <div className="mt-3 flex items-baseline gap-1 flex-wrap">
        <span className="font-display text-3xl md:text-4xl tracking-tight font-medium tabular text-ink">{formatPlanPrice(price)}</span>
        <span className="text-sm text-ink-muted">{t("billing.builder.period")}</span>
      </div>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("billing.builder.wh")}</span>
          <select
            value={warehouses}
            onChange={e => setWarehouses(parseInt(e.target.value, 10))}
            className="mt-1 w-full px-3 py-2 border border-line rounded-lg bg-paper text-sm font-mono focus:outline-none focus:border-lime-deep"
          >
            {WAREHOUSE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush font-semibold">{t("billing.builder.sku")}</span>
          <select
            value={skuPerWarehouse}
            onChange={e => setSkuPerWarehouse(parseInt(e.target.value, 10))}
            className="mt-1 w-full px-3 py-2 border border-line rounded-lg bg-paper text-sm font-mono focus:outline-none focus:border-lime-deep"
          >
            {SKU_OPTIONS.map(n => (
              <option key={n} value={n}>{n.toLocaleString("ru-RU")}</option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-[11px] text-ink-hush leading-relaxed">{t("billing.builder.pricing")}</p>

      <button
        onClick={handleBuy}
        disabled={busy}
        className="mt-4 w-full py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white"
      >
        {busy ? t("billing.btn.busy") : isExactCurrent ? t("billing.builder.renew") : t("billing.builder.buy")}
      </button>
      {errorMsg && (
        <p className="mt-2 text-xs text-rose-600">{errorMsg}</p>
      )}
    </div>
  );
}
