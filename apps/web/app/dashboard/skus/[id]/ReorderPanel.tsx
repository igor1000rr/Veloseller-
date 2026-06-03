"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n";

type Props = {
  productId: string;
  adjustedVelocity: number;
  currentStock: number;
  leadTimeDays: number;
  safetyDays: number;
};

export function ReorderPanel({ productId, adjustedVelocity, currentStock, leadTimeDays: initLead, safetyDays: initSafety }: Props) {
  const router = useRouter();
  const [leadTime, setLeadTime] = useState(initLead);
  const [safety, setSafety] = useState(initSafety);
  const [reorderFor, setReorderFor] = useState(30);
  const [saving, setSaving] = useState(false);

  const safetyStock = Math.round(adjustedVelocity * safety);
  const reorderPoint = Math.round(adjustedVelocity * leadTime + safetyStock);
  const daysUntilReorder = adjustedVelocity > 0
    ? Math.max(0, Math.floor((currentStock - reorderPoint) / adjustedVelocity))
    : null;
  const recommendedQty = Math.round(adjustedVelocity * reorderFor);

  async function save() {
    setSaving(true);
    await fetch(`/api/products/${productId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_time_days: leadTime, safety_days: safety }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">{t("sku.reorder.title")}</h2>
      <p className="text-sm text-slate-500 mb-4">{t("sku.reorder.subtitle")}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-700">{t("sku.reorder.leadTimeLabel")}</span>
          <input type="number" value={leadTime} onChange={e => setLeadTime(parseInt(e.target.value) || 0)}
                 className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" min={0} max={365}/>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">{t("sku.reorder.safetyDaysLabel")}</span>
          <input type="number" value={safety} onChange={e => setSafety(parseInt(e.target.value) || 0)}
                 className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" min={0} max={365}/>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">{t("sku.reorder.reorderForLabel")}</span>
          <input type="number" value={reorderFor} onChange={e => setReorderFor(parseInt(e.target.value) || 0)}
                 className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" min={1} max={365}/>
        </label>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("sku.reorder.safetyStock")} value={safetyStock} />
        <Stat label={t("sku.reorder.reorderPoint")} value={reorderPoint} accent="blue" />
        <Stat label={t("sku.reorder.untilReorder")} value={daysUntilReorder == null ? "—" : `${daysUntilReorder} ${t("unit.dayShort")}`}
              accent={daysUntilReorder != null && daysUntilReorder <= 0 ? "red" : daysUntilReorder != null && daysUntilReorder <= 7 ? "amber" : "slate"} />
        <Stat label={t("sku.reorder.orderNow")} value={recommendedQty} accent="violet" />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm rounded-lg disabled:opacity-50">
          {saving ? t("common.saving") : t("sku.reorder.saveBtn")}
        </button>
        {daysUntilReorder != null && daysUntilReorder === 0 && (
          <span className="text-sm text-red-700 font-medium">⚠ {t("sku.reorder.timeToReorder")}</span>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: "blue" | "violet" | "red" | "amber" | "slate" }) {
  const colors = {
    blue: "bg-blue-50 border-blue-100 text-blue-700",
    violet: "bg-violet-50 border-violet-100 text-violet-700",
    red: "bg-red-50 border-red-100 text-red-700",
    amber: "bg-amber-50 border-amber-100 text-amber-700",
    slate: "bg-slate-50 border-slate-100 text-slate-700",
  };
  const cls = accent ? colors[accent] : "bg-slate-50 border-slate-100 text-slate-700";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-xs">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
