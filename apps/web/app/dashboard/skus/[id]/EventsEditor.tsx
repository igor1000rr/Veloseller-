"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createProductEvent, updateProductEvent, deleteProductEvent } from "../actions";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";
const L = {
  add: isEn ? "Add event" : "Добавить событие",
  actual: isEn ? "Active events" : "Актуальные события",
  upcoming: isEn ? "Upcoming (3 mo)" : "Будущие события (3 мес)",
  name: isEn ? "Event name" : "Название события",
  start: isEn ? "Start date" : "Дата начала",
  end: isEn ? "End date" : "Дата окончания",
  comment: isEn ? "Comment" : "Комментарий",
  save: isEn ? "Save" : "Сохранить",
  cancel: isEn ? "Cancel" : "Отмена",
  del: isEn ? "Delete" : "Удалить",
  holiday: isEn ? "holiday" : "праздник",
  saving: isEn ? "saving…" : "сохранение…",
  error: isEn ? "error" : "ошибка",
  optional: isEn ? "optional" : "необязательно",
  colName: isEn ? "Name" : "Наименование",
  colStart: isEn ? "Start date" : "Дата начала",
  colEnd: isEn ? "End date" : "Дата завершения",
  colComment: isEn ? "Comment" : "Комментарий",
  empty: isEn ? "No events" : "Событий нет",
};

/** Событие календаря. source='holiday' — виртуальный праздник (read-only). */
export type EventItem = {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  comment: string | null;
  source: "user" | "holiday";
};

const todayISO = () => new Date().toISOString().slice(0, 10);
function addMonthsISO(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
function fmt(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
const endOf = (e: EventItem) => e.endDate ?? e.startDate;

const badgeCls =
  "inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[11px] tracking-wider border border-orange/40 bg-orange/10 text-orange hover:bg-orange/20 transition";

/**
 * Календарь событий по SKU (под тегами в карточке товара).
 *
 * Бейджи «Актуальные события (N)» / «Будущие события 3 мес (N)» (оранжевые) +
 * кнопка «Добавить событие» (модалка). Клик по бейджу раскрывает редактируемую
 * таблицу соответствующих событий: правка inline + «Сохранить», удаление построчно.
 * Праздники (source='holiday') — read-only (приходят из lib/holidays, в БД не лежат).
 * Мутации — через server-actions create/update/deleteProductEvent (productId задан).
 */
export function EventsEditor({
  productId,
  connectionId,
  initial,
  holidays,
}: {
  productId: string;
  connectionId: string;
  initial: EventItem[];
  holidays: EventItem[];
}) {
  const [userEvents, setUserEvents] = useState<EventItem[]>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [panel, setPanel] = useState<null | "actual" | "upcoming">(null);
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

  function handleCreate(fields: { title: string; startDate: string; endDate: string | null; comment: string | null }) {
    setStatus("saving");
    startTransition(async () => {
      const res = await createProductEvent({ connectionId, productId, ...fields });
      if (res.ok && res.id) {
        const id = res.id;
        setUserEvents((prev) => [...prev, { id, source: "user", ...fields }]);
        setStatus("idle");
        setModal(false);
      } else {
        setStatus("error");
      }
    });
  }

  function handleUpdate(id: string, fields: { title: string; startDate: string; endDate: string | null; comment: string | null }) {
    setUserEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...fields } : e)));
    setStatus("saving");
    startTransition(async () => {
      const res = await updateProductEvent(id, fields);
      setStatus(res.ok ? "idle" : "error");
    });
  }

  function handleDelete(id: string) {
    setUserEvents((prev) => prev.filter((e) => e.id !== id));
    setStatus("saving");
    startTransition(async () => {
      const res = await deleteProductEvent(id);
      setStatus(res.ok ? "idle" : "error");
    });
  }

  const rows = panel === "actual" ? actual : panel === "upcoming" ? upcoming : [];

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" onClick={() => setPanel(panel === "actual" ? null : "actual")} className={badgeCls} aria-expanded={panel === "actual"}>
          {L.actual} · {actual.length}
        </button>
        <button type="button" onClick={() => setPanel(panel === "upcoming" ? null : "upcoming")} className={badgeCls} aria-expanded={panel === "upcoming"}>
          {L.upcoming} · {upcoming.length}
        </button>
        <button
          type="button"
          onClick={() => setModal(true)}
          className="inline-flex items-center rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border border-dashed border-line text-ink-hush hover:border-orange/60 hover:text-orange transition"
        >
          + {L.add}
        </button>
        {status === "saving" && <span className="font-mono text-[9px] text-ink-hush">{L.saving}</span>}
        {status === "error" && <span className="font-mono text-[9px] text-rose">{L.error}</span>}
      </div>

      {panel && <EventsTable rows={rows} onUpdate={handleUpdate} onDelete={handleDelete} />}
      {modal && <AddEventModal onClose={() => setModal(false)} onSubmit={handleCreate} />}
    </div>
  );
}

type Draft = { title: string; startDate: string; endDate: string; comment: string };

export function EventsTable({
  rows,
  onUpdate,
  onDelete,
}: {
  rows: EventItem[];
  onUpdate: (id: string, f: { title: string; startDate: string; endDate: string | null; comment: string | null }) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, Draft>>({});

  const rowsKey = rows.map((r) => r.id).join("\u0001");
  useEffect(() => {
    const d: Record<string, Draft> = {};
    for (const e of rows) {
      if (e.source !== "user") continue;
      d[e.id] = { title: e.title, startDate: e.startDate, endDate: e.endDate ?? "", comment: e.comment ?? "" };
    }
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  function saveAll() {
    for (const e of rows) {
      if (e.source !== "user") continue;
      const d = draft[e.id];
      if (!d || !d.title.trim() || !d.startDate) continue;
      const changed =
        d.title !== e.title ||
        d.startDate !== e.startDate ||
        (d.endDate || "") !== (e.endDate ?? "") ||
        (d.comment || "") !== (e.comment ?? "");
      if (changed) {
        onUpdate(e.id, {
          title: d.title.trim().slice(0, 50),
          startDate: d.startDate,
          endDate: d.endDate || null,
          comment: d.comment.trim() ? d.comment.slice(0, 1000) : null,
        });
      }
    }
  }

  if (rows.length === 0) {
    return <div className="mt-2 rounded-lg border border-line bg-bg-soft p-3 text-xs text-ink-muted">{L.empty}</div>;
  }

  const hasEditable = rows.some((r) => r.source === "user");

  return (
    <div className="mt-2 rounded-lg border border-orange/30 bg-orange/5 p-2 sm:p-3 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-ink-hush">
            <th className="px-1.5 py-1 font-medium">{L.colName}</th>
            <th className="px-1.5 py-1 font-medium">{L.colStart}</th>
            <th className="px-1.5 py-1 font-medium">{L.colEnd}</th>
            <th className="px-1.5 py-1 font-medium">{L.colComment}</th>
            <th className="px-1.5 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            if (e.source === "holiday") {
              return (
                <tr key={e.id} className="border-t border-orange/15">
                  <td className="px-1.5 py-1.5 text-ink-soft">
                    {e.title} <span className="ml-1 font-mono text-[9px] uppercase text-orange/70">{L.holiday}</span>
                  </td>
                  <td className="px-1.5 py-1.5 font-mono text-ink-muted whitespace-nowrap">{fmt(e.startDate)}</td>
                  <td className="px-1.5 py-1.5 font-mono text-ink-muted whitespace-nowrap">{fmt(e.endDate)}</td>
                  <td className="px-1.5 py-1.5 text-ink-muted">{e.comment}</td>
                  <td className="px-1.5 py-1.5" />
                </tr>
              );
            }
            const d = draft[e.id] ?? { title: e.title, startDate: e.startDate, endDate: e.endDate ?? "", comment: e.comment ?? "" };
            const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, [e.id]: { ...d, ...patch } }));
            return (
              <tr key={e.id} className="border-t border-orange/15 align-top">
                <td className="px-1 py-1">
                  <input value={d.title} maxLength={50} onChange={(ev) => set({ title: ev.target.value })} className="w-full min-w-[120px] px-1.5 py-1 rounded border border-line bg-paper text-ink outline-none focus:border-orange/60" />
                </td>
                <td className="px-1 py-1">
                  <input type="date" value={d.startDate} onChange={(ev) => set({ startDate: ev.target.value })} className="px-1.5 py-1 rounded border border-line bg-paper font-mono text-ink outline-none focus:border-orange/60" />
                </td>
                <td className="px-1 py-1">
                  <input type="date" value={d.endDate} min={d.startDate} onChange={(ev) => set({ endDate: ev.target.value })} className="px-1.5 py-1 rounded border border-line bg-paper font-mono text-ink outline-none focus:border-orange/60" />
                </td>
                <td className="px-1 py-1">
                  <input value={d.comment} maxLength={1000} onChange={(ev) => set({ comment: ev.target.value })} className="w-full min-w-[140px] px-1.5 py-1 rounded border border-line bg-paper text-ink outline-none focus:border-orange/60" />
                </td>
                <td className="px-1 py-1 whitespace-nowrap">
                  <button type="button" onClick={() => onDelete(e.id)} className="font-mono text-[10px] uppercase tracking-wider text-rose hover:underline">{L.del}</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasEditable && (
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={saveAll} className="rounded-md bg-orange px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-white hover:opacity-90 transition">{L.save}</button>
        </div>
      )}
    </div>
  );
}

export function AddEventModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (f: { title: string; startDate: string; endDate: string | null; comment: string | null }) => void;
}) {
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState("");
  const [comment, setComment] = useState("");
  const valid = title.trim().length > 0 && !!startDate && (!endDate || endDate >= startDate);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg font-medium text-ink mb-3">{L.add}</h3>
        <div className="space-y-3">
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">{L.name} *</span>
            <input value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} autoFocus className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-line bg-paper text-sm text-ink outline-none focus:border-orange/60" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">{L.start} *</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-line bg-paper font-mono text-sm text-ink outline-none focus:border-orange/60" />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">
                {L.end} <span className="normal-case text-ink-hush/70">({L.optional})</span>
              </span>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-line bg-paper font-mono text-sm text-ink outline-none focus:border-orange/60" />
            </label>
          </div>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-wider text-ink-hush">
              {L.comment} <span className="normal-case text-ink-hush/70">({L.optional})</span>
            </span>
            <textarea value={comment} maxLength={1000} rows={3} onChange={(e) => setComment(e.target.value)} className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-line bg-paper text-sm text-ink outline-none focus:border-orange/60 resize-none" />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-ink-hush hover:text-ink transition">{L.cancel}</button>
          <button
            type="button"
            disabled={!valid}
            onClick={() => onSubmit({ title: title.trim().slice(0, 50), startDate, endDate: endDate || null, comment: comment.trim() ? comment.slice(0, 1000) : null })}
            className="rounded-lg bg-orange px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-white hover:opacity-90 transition disabled:opacity-40"
          >
            {L.save}
          </button>
        </div>
      </div>
    </div>
  );
}
