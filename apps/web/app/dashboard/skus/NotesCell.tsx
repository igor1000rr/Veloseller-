"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveUserNotes } from "./actions";
import { t } from "@/lib/i18n";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Inline-редактирование заметки по SKU.
 *
 * Старт: кликабельный текст / placeholder. Клик → раскрытие textarea.
 * Сохранение: debounce 800мс после остановки печати + onBlur.
 * Индикация: "сохраняется...", "сохранено" (исчезает через 1.5с), "ошибка".
 *
 * Touch-friendly: кнопка "+ заметка" имеет min-height 36px для тача.
 *
 * Заметка экспортируется в Excel вместе с метриками — для удобства закупщика
 * (он может написать "взять 200 шт у поставщика X" и видеть это в выгрузке).
 */
export function NotesCell({ productId, initial }: { productId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(initial ?? "");

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function persist(text: string) {
    if (text === lastSavedRef.current) {
      setStatus("idle");
      return;
    }
    setStatus("saving");
    startTransition(async () => {
      const res = await saveUserNotes(productId, text);
      if (res.ok) {
        lastSavedRef.current = text;
        setStatus("saved");
        setTimeout(() => setStatus(s => (s === "saved" ? "idle" : s)), 1500);
      } else {
        setStatus("error");
      }
    });
  }

  function onChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => persist(next), 800);
  }

  function onBlur() {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    persist(value);
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-left text-xs text-ink-soft hover:text-ink hover:bg-bg-soft px-2 py-2 -mx-2 -my-1 rounded max-w-[200px] truncate block w-full transition min-h-[32px]"
        title={value || t("sku.notes.addHint")}
      >
        {value || <span className="text-ink-hush italic">{t("sku.notes.addBtn")}</span>}
      </button>
    );
  }

  return (
    <div className="relative inline-block min-w-[180px] sm:min-w-[200px]">
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={e => {
          if (e.key === "Escape") {
            setValue(lastSavedRef.current);
            setEditing(false);
            if (debounceRef.current) clearTimeout(debounceRef.current);
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            persist(value);
            setEditing(false);
          }
        }}
        rows={2}
        maxLength={2000}
        placeholder={t("sku.notes.placeholder")}
        className="w-full px-2 py-1.5 text-xs border border-lime-deep/40 rounded resize-y min-h-[48px] bg-paper focus:outline-none focus:border-lime-deep font-sans"
      />
      <div className="absolute -bottom-4 right-0 font-mono text-[9px] uppercase tracking-wider">
        {status === "saving" && <span className="text-ink-hush">{t("sku.notes.saving")}</span>}
        {status === "saved" && <span className="text-lime-deep">{t("sku.notes.saved")}</span>}
        {status === "error" && <span className="text-rose">{t("sku.notes.error")}</span>}
      </div>
    </div>
  );
}
