"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";

export function HealthKpi({
  label,
  value,
  breakdown,
  accent = "violet",
}: {
  label: string;
  value: string | number;
  breakdown: BreakdownRow[];
  accent?: "violet" | "teal" | "blue";
}) {
  const [open, setOpen] = useState(false);

  const accents = {
    violet: "border-l-violet-500",
    teal: "border-l-teal-500",
    blue: "border-l-blue-500",
  };

  return (
    <div
      className={`relative bg-white border border-slate-200 border-l-4 ${accents[accent]} rounded-xl p-4 cursor-help`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-1">
        {label}
        <span className="text-slate-400">ⓘ</span>
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>

      {open && breakdown.length > 0 && (
        <div className="absolute z-10 left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-64 text-sm">
          <div className="text-xs font-semibold text-slate-700 mb-2">{t("sku.health.reasons")}</div>
          <ul className="space-y-1.5">
            {breakdown.map((b, i) => (
              <li key={i} className="flex justify-between gap-3 text-xs">
                <span className="text-slate-600">{b.label}</span>
                <span className={`font-mono font-semibold whitespace-nowrap ${
                  b.tone === "bad" ? "text-red-600" :
                  b.tone === "warn" ? "text-amber-700" :
                  "text-slate-700"
                }`}>{b.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export type BreakdownRow = { label: string; value: string; tone?: "bad" | "warn" | "neutral" };

// Хелперы для построения breakdown — переиспользуются между Health и Confidence

export function buildHealthBreakdown(m: any): BreakdownRow[] {
  if (!m) return [];
  const rows: BreakdownRow[] = [];
  const periodDays = Number(m.in_stock_days ?? 0) + Number(m.stockout_days ?? 0);
  if (m.stockout_days != null && m.stockout_days > 0 && periodDays > 0) {
    const penalty = Math.min(40, (Number(m.stockout_days) / periodDays) * 40);
    rows.push({ label: t("sku.health.bd.stockout", { days: m.stockout_days, period: periodDays }), value: `−${penalty.toFixed(1)}`, tone: "bad" });
  }
  if (m.coverage_days != null && Number(m.coverage_days) <= 7) {
    const cov = Number(m.coverage_days);
    const penalty = Math.max(0, ((7 - cov) / 7) * 25);
    rows.push({ label: t("sku.health.bd.lowCoverage", { days: cov.toFixed(0) }), value: `−${penalty.toFixed(1)}`, tone: "warn" });
  }
  if (m.coverage_days != null && Number(m.coverage_days) > 180) {
    const cov = Number(m.coverage_days);
    const penalty = Math.min(25, ((cov - 180) / 180) * 25);
    rows.push({ label: t("sku.health.bd.illiquid", { days: cov.toFixed(0) }), value: `−${penalty.toFixed(1)}`, tone: "warn" });
  }
  if (m.confidence_score != null) {
    const conf = Number(m.confidence_score);
    const penalty = (100 - conf) * 0.2;
    if (penalty > 0) {
      rows.push({ label: t("sku.health.bd.confidence", { pct: conf.toFixed(0) }), value: `−${penalty.toFixed(1)}`, tone: "neutral" });
    }
  }
  if (rows.length === 0) {
    rows.push({ label: t("sku.health.bd.allGood"), value: "0", tone: "neutral" });
  }
  return rows;
}

/**
 * Confidence breakdown из tvelo_metrics.confidence_breakdown JSON.
 *
 * БАГ FIX: раньше использовались ключи `*_penalty` — таких полей в JSON нет, hover показывал
 * только "Все события чистые". Реальные ключи (из app/schemas.py:ConfidenceBreakdown):
 *   replenishment_like, anomaly_like, missing_data, low_history, initial, final
 *
 * Каждое значение — это уже процент штрафа (например repl=14.29 = -14.29% от initial).
 */
export function buildConfidenceBreakdown(m: any): BreakdownRow[] {
  const cb = m?.confidence_breakdown;
  if (!cb || typeof cb !== "object") return [];
  const rows: BreakdownRow[] = [];
  const labels: Array<[string, string]> = [
    ["replenishment_like", t("sku.conf.replenishment")],
    ["anomaly_like",       t("sku.conf.anomaly")],
    ["missing_data",       t("sku.conf.missingData")],
    ["low_history",        t("sku.conf.lowHistory")],
  ];
  for (const [key, label] of labels) {
    const v = Number(cb[key] ?? 0);
    if (v > 0) {
      rows.push({ label, value: `−${v.toFixed(1)}%`, tone: "warn" });
    }
  }
  if (rows.length === 0) rows.push({ label: t("sku.conf.allClean"), value: "0%", tone: "neutral" });
  return rows;
}
