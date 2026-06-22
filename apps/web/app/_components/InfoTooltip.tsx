"use client";

import { useId, useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Маленький знак «i» для подсказок на метриках.
 *
 * Архитектура:
 * - Кнопка «i» остаётся в потоке документа (inline-flex).
 * - Сам тултип рендерится через React Portal в document.body,
 *   а позиция вычисляется через getBoundingClientRect() кнопки.
 *   Это нужно потому что таблицы и карточки имеют overflow-x:auto
 *   и absolute-позиционированный тултип внутри них обрезался границей.
 * - На десктопе работает на hover, на тач-устройствах — click toggle.
 * - При клике вне или скролле — закрывается.
 */
export function InfoTooltip({
  text,
  position = "top",
}: {
  text: string;
  position?: "top" | "bottom" | "left";
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  const visible = open || hover;

  // Вычисляем координаты при показе/скролле/ресайзе
  useLayoutEffect(() => {
    if (!visible || !wrapRef.current) return;

    const compute = () => {
      if (!wrapRef.current) return;
      const btn = wrapRef.current.getBoundingClientRect();

      // Размеры тултипа — берём фактические после рендера, иначе оценочно
      const tw = tooltipRef.current?.offsetWidth ?? 256;
      const th = tooltipRef.current?.offsetHeight ?? 60;

      let top = 0;
      let left = 0;

      if (position === "top") {
        top = btn.top - th - 8;
        left = btn.left + btn.width / 2 - tw / 2;
      } else if (position === "bottom") {
        top = btn.bottom + 8;
        left = btn.left + btn.width / 2 - tw / 2;
      } else {
        top = btn.top + btn.height / 2 - th / 2;
        left = btn.left - tw - 8;
      }

      // Защита от выхода за viewport
      const margin = 8;
      const maxLeft = window.innerWidth - tw - margin;
      if (left < margin) left = margin;
      if (left > maxLeft) left = Math.max(margin, maxLeft);

      // Если сверху не помещается — перебрасываем вниз
      if (position === "top" && top < margin) {
        top = btn.bottom + 8;
      }
      // Если снизу не помещается — наверх
      const maxTop = window.innerHeight - th - margin;
      if (position === "bottom" && top > maxTop) {
        top = btn.top - th - 8;
      }

      setCoords({ top, left });
    };

    compute();

    // Перепозиционируем при прокрутке любого предка и при ресайзе
    window.addEventListener("scroll", compute, true);
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute, true);
      window.removeEventListener("resize", compute);
    };
  }, [visible, position, text]);

  // Закрытие по клику вне
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("touchstart", onClick);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("touchstart", onClick);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex items-center align-middle ml-1"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        aria-label="Подсказка"
        aria-describedby={visible ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        className="size-4 sm:size-3.5 rounded-full bg-ink-hush/15 text-ink-hush text-[10px] sm:text-[9px] font-bold flex items-center justify-center cursor-help hover:bg-ink-hush/30 hover:text-ink focus:bg-ink-hush/30 focus:text-ink transition select-none touch-manipulation focus:outline-none"
      >
        i
      </button>
      {mounted && visible &&
        createPortal(
          <div
            id={id}
            ref={tooltipRef}
            role="tooltip"
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              // Пока coords не посчитаны — рендерим невидимым,
              // чтобы измерить размер, потом сделаем visible через opacity
              opacity: coords ? 1 : 0,
              pointerEvents: "none",
              zIndex: 9999,
            }}
            className="px-3 py-2 rounded-md bg-ink text-paper text-[11px] leading-snug font-normal normal-case tracking-normal w-64 max-w-[calc(100vw-1rem)] text-left whitespace-pre-line shadow-lg transition-opacity"
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  );
}
