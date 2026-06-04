"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveUserNotes } from "../actions";
import { t } from "@/lib/i18n";

type Props = {
  productId: string;
  adjustedVelocity: number;
  currentStock: number;
  leadTimeDays: number;
  /** Больше не используется в расчёте (Александр 04.06.2026), но page.tsx
   *  всё ещё передаёт проп — оставлен в типе для совместимости. */
  safetyDays: number;
  /** Текущие заметки SKU — кнопка дописывает сводку, не затирая ручные записи. */
  initialNotes: string | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Блок «Закупка» в карточке SKU.
 *
 * Александр 04.06.2026:
 *  - Lead time → «Срок поставки», Reorder point → «Точка перезаказа» (словарь);
 *  - Safety days / Safety stock убраны полностью — из UI, формулы и сохранения.
 *    Точка перезаказа = TVelo × срок поставки;
 *  - Поле «Товары в пути (шт)» — то, что уже едет от поставщика. Локальный
 *    калькулятор, увеличивает эффективный остаток в расчёте «До заказа»;
 *  - Блок «Текущее наличие» — между точкой перезаказа и «До заказа»;
 *  - Кнопка «Сохранить в Заметки»: пишет сводку расчёта в user_notes SKU
 *    (видна в колонке «Заметки» на вкладке SKU и в Excel-выгрузке) —
 *    дописыванием к существующим заметкам. Заодно тихо сохраняет срок
 *    поставки (PATCH /reorder), иначе его негде было бы задать.
 */
export function ReorderPanel({ productId, adjustedVelocity, currentStock, leadTimeDays: initLead, initialNotes }: Props) {
  const router = useRouter();
  const [leadTime, setLeadTime] = useState(initLead);
  const [reorderFor, setReorderFor] = useState(30);
  const [inTransit, setInTransit] = useState(0);
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Актуальные заметки между сохранениями (router.refresh асинхронный —
  // повторное нажатие не должно затирать только что дописанную сводку).
  const notesRef = useRef(initialNotes ?? "");

  const reorderPoint = Math.round(adjustedVelocity * leadTime);
  // «До заказа»: товары в пути считаем уже доступными — они приедут раньше,
  // чем успеет уехать новый заказ.
  const effectiveStock = currentStock + inTransit;
  const daysUntilReorder = adjustedVelocity > 0
    ? Math.max(0, Math.floor((effectiveStock - reorderPoint) / adjustedVelocity))
    : null;
  const recommendedQty = Math.round(adjustedVelocity * reorderFor);

  async function save() {
    setStatus("saving");

    // Сводка расчёта — одна строка в заметках, например:
    // «04.06.2026 · закупка: 35 шт на 30 дн, поставка 14 дн, в пути 20 шт»
    const summary =
      t("sku.reorder.noteTemplate", {
        date: new Date().toLocaleDateString("ru-RU"),
        qty: recommendedQty,
        days: reorderFor,
        lead: leadTime,
      }) + (inTransit > 0 ? t("sku.reorder.noteInTransit", { n: inTransit }) : "");

    const base = notesRef.current.trim();
    let next = base ? `${base}\n${summary}` : summary;
    // Серверный лимит user_notes — 2000 символов (saveUserNotes режет хвост).
    // Режем старое начало, чтобы свежая сводка не потерялась.
    if (next.length > 2000) next = next.slice(next.length - 2000);

    const [, notesRes] = await Promise.all([
      fetch(`/api/products/${productId}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_time_days: leadTime }),
      }).catch(() => null),
      saveUserNotes(productId, next),
    ]);

    if (notesRes.ok) {
      notesRef.current = next;
      setStatus("saved");
      setTimeout(() => setStatus(s => (s === "saved" ? "idle" : s)), 2000);
    } else {
      setStatus("error");
    }
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
          <span className="text-xs font-medium text-slate-700">{t("sku.reorder.reorderForLabel")}</span>
          <input type="number" value={reorderFor} onChange={e => setReorderFor(parseInt(e.target.value) || 0)}
                 className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" min={1} max={365}/>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-700">{t("sku.reorder.inTransitLabel")}</span>
          <input type="number" value={inTransit} onChange={e => setInTransit(Math.max(0, parseInt(e.target.value) || 0))}
                 className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg" min={0} max={1000000}/>
        </label>
      </div>

      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label={t("sku.reorder.reorderPoint")} value={reorderPoint} accent="blue" />
        <Stat label={t("sku.reorder.currentStock")} value={currentStock} />
        <Stat label={t("sku.reorder.untilReorder")} value={daysUntilReorder == null ? "—" : `${daysUntilReorder} ${t("unit.dayShort")}`}
              accent={daysUntilReorder != null && daysUntilReorder <= 0 ? "red" : daysUntilReorder != null && daysUntilReorder <= 7 ? "amber" : "slate"} />
        <Stat label={t("sku.reorder.orderNow")} value={recommendedQty} accent="violet" />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={status === "saving"}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm rounded-lg disabled:opacity-50">
          {status === "saving" ? t("common.saving") : t("sku.reorder.saveBtn")}
        </button>
        {status === "saved" && (
          <span className="text-sm text-emerald-700 font-medium">✓ {t("sku.reorder.savedToNotes")}</span>
        )}
        {status === "error" && (
          <span className="text-sm text-red-700 font-medium">{t("sku.notes.error")}</span>
        )}
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
