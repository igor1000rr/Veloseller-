import { useEffect, useRef, type RefObject } from "react";

/**
 * Доступность модалок/попапов одним хуком (a11y full pass):
 *   - Escape закрывает (onClose);
 *   - при открытии фокус уходит ВНУТРЬ контейнера (на initialFocusRef либо первый
 *     фокусируемый), чтобы клавиатура/скринридер сразу были в диалоге;
 *   - при закрытии фокус ВОЗВРАЩАЕТСЯ на элемент, который был активен до открытия
 *     (обычно — кнопка-триггер), если он ещё в DOM;
 *   - trap (опц.) зацикливает Tab/Shift+Tab внутри контейнера — фокус не «утекает»
 *     на фон за модалкой.
 *
 * onClose держится в ref и НЕ входит в deps эффекта: его можно передавать
 * инлайн-стрелкой (`() => setOpen(false)`), и фокус НЕ будет перезахватываться на
 * каждый ререндер (иначе фокус «прыгал» бы на первый элемент при любом обновлении).
 *
 * trap=false для дровера с <iframe> (фокус внутри фрейма — отдельный документ, его
 * не protrap'ить) и для дропдаунов-листбоксов (там Tab по контракту уводит наружу
 * и закрывает попап). Для полноэкранных модалок без iframe — trap=true.
 */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.getAttribute("aria-hidden") !== "true");
}

export interface ModalA11yOptions {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  trap?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function useModalA11y({
  open,
  onClose,
  containerRef,
  trap = true,
  initialFocusRef,
}: ModalA11yOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Фокус внутрь: явный initialFocus → первый фокусируемый → сам контейнер.
    const target =
      initialFocusRef?.current ??
      (container ? focusableWithin(container)[0] : null) ??
      container;
    target?.focus?.();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (!trap || e.key !== "Tab" || !container) return;
      const items = focusableWithin(container);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === container)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Возврат фокуса на триггер — только если он ещё в DOM (после навигации мог уйти).
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open, trap, containerRef, initialFocusRef]);
}
