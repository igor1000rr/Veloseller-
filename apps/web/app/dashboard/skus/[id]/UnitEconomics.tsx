"use client";
import { useState } from "react";
import Link from "next/link";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";

// Правка 10 (#5): юнит-экономика (beta). Комиссия маркетплейса приходит из API
// (commission_pct последнего снапшота) как стартовый дефолт; логистику, эквайринг,
// рекламу и себестоимость продавец правит под себя. Прибыль с единицы =
// цена − (сумма %) × цена − себестоимость. Значения пока не персистятся (v1).
const L = {
  title: isEn ? "UNIT ECONOMICS" : "ЮНИТ-ЭКОНОМИКА",
  beta: "beta",
  h: isEn ? "Profit per unit" : "Прибыль с единицы",
  sub: isEn
    ? "Quick net-profit estimate per sale. Commission comes from the marketplace, the rest you adjust."
    : "Быстрая прикидка чистой прибыли с продажи. Комиссия — из маркетплейса, остальное правьте под себя.",
  price: isEn ? "Sale price" : "Цена продажи",
  cost: isEn ? "Cost (COGS)" : "Себестоимость",
  commission: isEn ? "Commission" : "Комиссия",
  logistics: isEn ? "Logistics" : "Логистика",
  acquiring: isEn ? "Acquiring" : "Эквайринг",
  ads: isEn ? "Ads" : "Реклама",
  profit: isEn ? "Profit / unit" : "Прибыль / шт",
  margin: isEn ? "Margin" : "Маржа",
  spend: isEn ? "Fees + cost" : "Расходы + с/с",
  fromApi: isEn ? "from API" : "из API",
  note: isEn ? "Values aren't saved yet — for quick modeling." : "Значения пока не сохраняются — для быстрой прикидки.",
};

const RUB = "₽";

export function UnitEconomics({ priceRub, commissionPct, costRub }: { priceRub: number; commissionPct: number | null; costRub?: number | null }) {
  const [price, setPrice] = useState<string>(priceRub ? priceRub.toFixed(0) : "");
  const [cost, setCost] = useState<string>(costRub != null ? String(costRub) : "");
  const [commission, setCommission] = useState<string>(commissionPct != null ? String(commissionPct) : "");
  const [logistics, setLogistics] = useState<string>("1");
  const [acquiring, setAcquiring] = useState<string>("2");
  const [ads, setAds] = useState<string>("0");

  const n = (s: string) => {
    const v = parseFloat(s.replace(",", "."));
    return isFinite(v) ? v : 0;
  };
  const p = n(price);
  const totalPct = n(commission) + n(logistics) + n(acquiring) + n(ads);
  const fees = (p * totalPct) / 100;
  const spend = fees + n(cost);
  const profit = p - spend;
  const margin = p > 0 ? (profit / p) * 100 : 0;
  const fmt = (v: number) => Math.round(v).toLocaleString(isEn ? "en-US" : "ru-RU");
  const profitColor = profit > 0 ? "text-lime-deep" : profit < 0 ? "text-rose" : "text-ink";

  return (
    <div className="rounded-2xl border border-line bg-paper p-4 sm:p-6">
      <div className="flex items-center gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-hush font-semibold">{L.title}</h2>
        <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-px rounded bg-azure/10 text-azure border border-azure/30">{L.beta}</span>
      </div>
      <h3 className="font-display text-base sm:text-lg font-medium text-ink mt-1">{L.h}</h3>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-ink-muted">{L.sub}</p>
        <Link
          href={"/dashboard/skus/cost-import" as any}
          className="shrink-0 mt-0.5 text-xs font-mono uppercase tracking-wider text-lime-deep hover:underline whitespace-nowrap"
        >
          {isEn ? "Add cost in bulk →" : "Добавить массово →"}
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label={L.price} suffix={RUB} value={price} onChange={setPrice} />
        <Field label={L.cost} suffix={RUB} value={cost} onChange={setCost} />
        <Field label={L.commission} suffix="%" value={commission} onChange={setCommission} hint={commissionPct != null ? L.fromApi : undefined} />
        <Field label={L.logistics} suffix="%" value={logistics} onChange={setLogistics} />
        <Field label={L.acquiring} suffix="%" value={acquiring} onChange={setAcquiring} />
        <Field label={L.ads} suffix="%" value={ads} onChange={setAds} />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
        <Result label={L.spend} value={`−${fmt(spend)} ${RUB}`} color="text-ink-soft" />
        <Result label={L.profit} value={`${profit < 0 ? "−" : ""}${fmt(Math.abs(profit))} ${RUB}`} color={profitColor} big />
        <Result label={L.margin} value={`${margin.toFixed(1)}%`} color={profitColor} big />
      </div>

      <p className="text-[11px] text-ink-hush mt-3 font-mono">{L.note}</p>
    </div>
  );
}

function Field({ label, suffix, value, onChange, hint }: {
  label: string; suffix: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush">
        {label}
        {hint && <span className="ml-1 text-azure normal-case tracking-normal">· {hint}</span>}
      </span>
      <div className="mt-1 flex items-center rounded-xl border border-line bg-paper focus-within:border-lime-deep transition overflow-hidden">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2 font-mono text-sm text-ink outline-none"
          placeholder="0"
        />
        <span className="px-2 text-ink-hush font-mono text-sm select-none">{suffix}</span>
      </div>
    </label>
  );
}

function Result({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-bg-soft p-3 sm:p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-hush truncate">{label}</div>
      <div className={`mt-1 font-display tabular font-medium ${big ? "text-lg sm:text-2xl" : "text-base sm:text-xl"} ${color}`}>{value}</div>
    </div>
  );
}
