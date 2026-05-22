"use client";

import { useId, useState, useEffect, useRef } from "react";

/**
 * Маленький знак «i» для подсказок на метриках.
 *
 * Подход:
 * - На десктопе работает через CSS hover (быстро, без JS state).
 * - На тач-устройствах hover не работает — используем focus-within и click-toggle.
 * - Ширина адаптивна: `max-w-[calc(100vw-2rem)]` чтобы не вылезала за viewport.
 * - При клике вне — закрывается.
 */
export function InfoTooltip({ text, position = "top" }: { text: string; position?: "top" | "bottom" | "left" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const id = useId();

  const positionClass = {
    top: "left-1/2 -translate-x-1/2 bottom-full mb-2",
    bottom: "left-1/2 -translate-x-1/2 top-full mt-2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
  }[position];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="group relative inline-flex items-center align-middle ml-1">
      <button
        type="button"
        aria-label="Подсказка"
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="size-4 sm:size-3.5 rounded-full bg-ink-hush/15 text-ink-hush text-[10px] sm:text-[9px] font-bold flex items-center justify-center cursor-help hover:bg-ink-hush/30 hover:text-ink focus:bg-ink-hush/30 focus:text-ink transition select-none touch-manipulation focus:outline-none"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`${open ? "visible opacity-100" : "invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"} transition-opacity absolute ${positionClass} px-3 py-2 rounded-md bg-ink text-paper text-[11px] leading-snug font-normal normal-case tracking-normal w-64 max-w-[min(16rem,calc(100vw-2rem))] text-left z-50 pointer-events-none shadow-lg`}
      >
        {text}
      </span>
    </span>
  );
}
