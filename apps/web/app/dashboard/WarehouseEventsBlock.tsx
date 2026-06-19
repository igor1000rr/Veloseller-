"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createProductEvent, updateProductEvent, deleteProductEvent } from "./skus/actions";
import { EventsTable, AddEventModal, type EventItem } from "./skus/[id]/EventsEditor";
import { InfoTooltip } from "../_components/InfoTooltip";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";
const L = {
  title: isEn ? "Events" : "События",
  tip: isEn
    ? "Warehouse-wide events: promotions, holidays, supply gaps. General events also appear on every product card."
    : "Общие события склада: акции, праздники, перебои. Видны на карточках всех товаров склада.",
  actual: isEn ? "Active" : "Актуальные",
  upcoming: isEn ? "Upcoming (3 mo)" : "Будущие (3 мес)",
  add: isEn ? "Add" : "Добавить",
  actualTitle: isEn ? "Active events" : "Актуальные события",
  upcomingTitle: isEn ? "Upcoming events (3 mo)" : "Будущие события (3 мес)",
  dup: isEn ? "General events are duplicated into product events" : "Общие события дублируются в события товаров",
  close: isEn ? "Close" : "Закрыть",
};

type EventFields = { title: string; startDate: string; endDate: string | null; comment: string | null };

const todayISO = () => new Date().toISOString().slice(0, 10);
function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
const endOf = (e: EventItem) => e.endDate ?? e.startDate;

/**
 * 4-й блок дашборда — общий календарь событий склада (Image 2).
 *
 * Карточка в стиле KPI-блоков: ссылки «Актуальные · N» / «Будущие 3 мес · N»
 * (открывают таблицу событий в модалке) и «Добавить» (модалка добавления).
 * Все события — общие по складу (product_id = NULL), поэтому в карточках
 * товаров этого склада они тоже видны. Праздники (source='holiday') read-only.
 */
export function WarehouseEventsBlock({
  connectionId,
  initial,
  holidays,
}: {
  connectionId: string;
  initial: EventItem[];
  holidays: EventItem[];
}) {
  const [userEvents, setUserEvents] = useState<EventItem[]>(initial);
  const [view, setView] = useState<null | "actual" | "upcoming">(null);
  const [modal, setModal] = useState(false);
  const [, startTransition] = useTransition();

  const initialKey = initial.map((e) => `${e.id}:${e.title}:${e.startDate}:${e.endDate}:${e.comment}`).join("\u0001");
  useEffect(() => {
    setUserEvents(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const today = todayISO();
  const horizon = addMonthsISO(today, 3);
  const all = useMemo(() => [...holidays, ...userEvents], [holidays, userEvents]);
  const actual = useMemo(
    () => all.filter((e) => e.startDate <= today && endOf(e) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [all, today],
  );
  const upcoming = useMemo(
    () => all.filter((e) => e.startDate > today && e.startDate <= horizon).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [all, today, horizon],
  );

  function handleCreate(fields: EventFields) {
    startTransition(async () => {
      const res = await createProductEvent({ connectionId, productId: null, ...fields });
      if (res.ok && res.id) {
        const id = res.id;
        setUserEvents((prev) => [...prev, { id, source: "user", ...fields }]);
        setModal(false);
      }
    });
  }
  function handleUpdate(id: string, fields: EventFields) {
    setUserEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    startTransition(async () => {
      await updateProductEvent(id, fields);
    });
  }
  function handleDelete(id: string) {
    setUserEvents((prev) => prev.filter((e) => e.id !== id));
    startTransition(async () => {
      await deleteProductEvent(id);
    });
  }

  const rows = view === "actual" ? actual : view === "upcoming" ? upcoming : [];
  const viewTitle = view === "actual" ? L.actualTitle : L.upcomingTitle;

  return (
    <div className="rounded-2xl border-2 border-orange/30 bg-orange/5 p-4 sm:p-5">
      <div className="font-mono text-[10px] uppercase tracking-widest font-semibold flex items-center text-orange">
        {L.title}
        <InfoTooltip text={L.tip} />
      </div>
      <div className="mt-2 flex flex-col gap-1">
        <button type="button" onClick={() => setView("actual")} className="text-left font-display text-base text-orange hover:underline">
          {L.actual} · <span className="tabular font-medium">{actual.length}</span>
        </button>
        <button type="button" onClick={() => setView("upcoming")} className="text-left font-display text-base text-orange hover:underline">
          {L.upcoming} · <span className="tabular font-medium">{upcoming.length}</span>
        </button>
        <button type="button" onClick={() => setModal(true)} className="mt-0.5 text-left font-mono text-[11px] uppercase tracking-wider text-orange/90 hover:underline">
          + {L.add}
        </button>
      </div>
      <div className="mt-2 text-[10px] text-orange/70 leading-snug">{L.dup}</div>

      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setView(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-line bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-lg font-medium text-ink">{viewTitle}</h3>
              <button type="button" onClick={() => setView(null)} className="font-mono text-[11px] uppercase tracking-wider text-ink-hush hover:text-ink">{L.close}</button>
            </div>
            <EventsTable rows={rows} onUpdate={handleUpdate} onDelete={handleDelete} />
          </div>
        </div>
      )}
      {modal && <AddEventModal onClose={() => setModal(false)} onSubmit={handleCreate} />}
    </div>
  );
}
