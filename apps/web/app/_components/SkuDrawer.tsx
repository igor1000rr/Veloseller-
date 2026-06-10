"use client";
import { useEffect, useState } from "react";
import { LOCALE } from "@/lib/features";

const isEn = LOCALE === "en";
const L = {
  title: isEn ? "Product card" : "Карточка товара",
  openFull: isEn ? "Open full page" : "Открыть целиком",
  close: isEn ? "Close" : "Закрыть",
};

// Правка 10 (#2): карточка SKU в выезжающей справа панели (~78% ширины).
// Открывается по событию velo:open-sku из SkuLink (строка списка). Внутри —
// iframe на роут карточки с ?embed=1 (шапка кабинета скрыта). URL списка не
// меняется; Esc и клик по фону закрывают. Карточка read-only → iframe безопасен.
export default function SkuDrawer() {
  const [id, setId] = useState<string | null>(null);
  const open = id !== null;

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string } | undefined;
      if (detail?.id) setId(detail.id);
    };
    window.addEventListener("velo:open-sku", onOpen as EventListener);
    return () => window.removeEventListener("velo:open-sku", onOpen as EventListener);
  }, []);

  // Закрытие из карточки в iframe: BackToSkus в embed-режиме шлёт это сообщение
  // вместо навигации, чтобы не грузить список SKU внутрь панели (см. BackToSkus.tsx).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string } | null)?.type === "velo:close-sku") setId(null);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setId(null); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const cardUrl = `/dashboard/skus/${id}`;

  return (
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setId(null)} aria-hidden />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[1200px] flex-col bg-bg shadow-2xl sm:w-[82%] lg:w-[76%]">
        <div className="flex items-center justify-between border-b border-line bg-paper px-4 py-2.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-ink-hush">{L.title}</span>
          <div className="flex items-center gap-3">
            <a href={cardUrl} target="_blank" rel="noopener" className="font-mono text-[10px] uppercase tracking-widest text-lime-deep transition hover:text-ink">
              {L.openFull}
            </a>
            <button
              type="button"
              onClick={() => setId(null)}
              aria-label={L.close}
              className="inline-flex size-7 items-center justify-center rounded-lg border border-line text-ink-muted transition hover:border-lime-deep/40 hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>
        <iframe key={id} src={`${cardUrl}?embed=1`} title={L.title} className="w-full flex-1 border-0 bg-bg" />
      </div>
    </div>
  );
}
