"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveProductTags } from "../actions";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";
const L = {
  add: isEn ? "Add tag" : "Добавить тег",
  placeholder: isEn ? "tag…" : "тег…",
  saving: isEn ? "saving…" : "сохранение…",
  error: isEn ? "error" : "ошибка",
};

/**
 * Произвольные теги по SKU (правка 10, #6). Под названием товара в карточке.
 *
 * Теги — свободные строки (бренд/категория/поставщик/что угодно). Чип с «×»
 * удаляет, «+ Добавить тег» раскрывает инпут (Enter/blur — добавить, Esc —
 * отмена). Сохраняем весь массив через saveProductTags. На вкладке SKU теги
 * показываются чипами и кликабельны (фильтр ?tag=). Лимит/нормализация — на
 * сервере (20 × 40 символов, дедуп). Стейт синкается с пропом при refresh/нав.
 */
export function TagsEditor({ productId, initial }: { productId: string; initial: string[] | null }) {
  const [tags, setTags] = useState<string[]>(initial ?? []);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Синк с сервером: когда родитель приходит с новым initial (после нав/refresh).
  // Не трогаем, пока юзер вводит новый тег. dep — содержимое массива, не ссылка.
  useEffect(() => {
    if (adding) return;
    setTags(initial ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(initial ?? []).join("\u0001")]);

  useEffect(() => {
    if (adding && inputRef.current) inputRef.current.focus();
  }, [adding]);

  function persist(next: string[]) {
    setStatus("saving");
    startTransition(async () => {
      const res = await saveProductTags(productId, next);
      setStatus(res.ok ? "idle" : "error");
    });
  }

  function addTag(raw: string) {
    const tag = raw.trim().slice(0, 40);
    setDraft("");
    setAdding(false);
    if (!tag) return;
    if (tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return;
    if (tags.length >= 20) return;
    const next = [...tags, tag];
    setTags(next);
    persist(next);
  }

  function removeTag(tag: string) {
    const next = tags.filter((x) => x !== tag);
    setTags(next);
    persist(next);
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] tracking-wider border border-violet-200 bg-violet-50 text-violet-700"
        >
          #{tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            aria-label={`remove ${tag}`}
            className="text-violet-400 hover:text-violet-800 leading-none text-sm"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => addTag(draft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addTag(draft); }
            if (e.key === "Escape") { setDraft(""); setAdding(false); }
          }}
          maxLength={40}
          placeholder={L.placeholder}
          className="w-28 px-2 py-0.5 rounded border border-violet-300 bg-paper font-mono text-[11px] text-ink outline-none focus:border-violet-500"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider border border-dashed border-line text-ink-hush hover:border-violet-400 hover:text-violet-700 transition"
        >
          + {L.add}
        </button>
      )}

      {status === "saving" && <span className="font-mono text-[9px] text-ink-hush">{L.saving}</span>}
      {status === "error" && <span className="font-mono text-[9px] text-rose">{L.error}</span>}
    </div>
  );
}
