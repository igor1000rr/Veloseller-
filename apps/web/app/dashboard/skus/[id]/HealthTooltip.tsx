"use client";

import { useState } from "react";
import { t } from "@/lib/i18n";
import type { BreakdownRow } from "./health-breakdown";

// САМИ функции buildHealthBreakdown/buildConfidenceBreakdown переехали в
// ./health-breakdown.ts (без "use client"): их вызывает СЕРВЕРНЫЙ компонент
// карточки, а вызов функции из client-модуля на сервере в Next 15 кидает
// "Attempted to call ... from the server" (прод-инцидент, digest 801888437).
// Здесь остаётся только клиентский hover-компонент; тип реэкспортируем
// для обратной совместимости импортов.
export type { BreakdownRow } from "./health-breakdown";

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
