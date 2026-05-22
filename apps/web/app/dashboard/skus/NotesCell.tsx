"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveUserNotes } from "./actions";

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Inline-редактирование заметки по SKU.
 *
 * Старт: кликабельный текст / placeholder "—". Клик → раскрытие textarea.
 * Сохранение: debounce 800мс после остановки печати + onBlur.
 * Индикация: "сохраняется...", "сохранено" (исчезает через 1.5с), "ошибка".
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

  // Авто-фокус когда раскрылись
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editing && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      taRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  // Очистка debounce при unmount
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
        // Через 1.5с убираем индикатор "сохранено"
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
        className="text-left text-xs text-ink-soft hover:text-ink hover:bg-bg-soft px-2 py-1 -mx-2 -my-1 rounded max-w-[200px] truncate block w-full transition"
        title={value || "Кликните чтобы добавить заметку"}
      >
        {value || <span className="text-ink-hush italic">+ заметка</span>}
      </button>
    );
  }

  return (
    <div className="relative inline-block min-w-[200px]">
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={e => {
          // Esc — закрыть без сохранения (откатить к last saved)
          if (e.key === "Escape") {
            setValue(lastSavedRef.current);
            setEditing(false);
            if (debounceRef.current) clearTimeout(debounceRef.current);
          }
          // Ctrl/Cmd+Enter — сохранить и закрыть
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            persist(value);
            setEditing(false);
          }
        }}
        rows={2}
        maxLength={2000}
        placeholder="например: взять 200 шт у поставщика X"
        className="w-full px-2 py-1 text-xs border border-lime-deep/40 rounded resize-y min-h-[48px] bg-paper focus:outline-none focus:border-lime-deep font-sans"
      />
      {/* Индикатор статуса в углу */}
      <div className="absolute -bottom-4 right-0 font-mono text-[9px] uppercase tracking-wider">
        {status === "saving" && <span className="text-ink-hush">сохраняется…</span>}
        {status === "saved" && <span className="text-lime-deep">сохранено</span>}
        {status === "error" && <span className="text-rose">ошибка</span>}
      </div>
    </div>
  );
}
