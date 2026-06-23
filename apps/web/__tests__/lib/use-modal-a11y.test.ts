import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useModalA11y } from "@/lib/use-modal-a11y";

function press(key: string, opts: KeyboardEventInit = {}) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }),
  );
}

describe("useModalA11y", () => {
  let trigger: HTMLButtonElement;
  let container: HTMLDivElement;
  let btnA: HTMLButtonElement;
  let btnB: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    container = document.createElement("div");
    btnA = document.createElement("button");
    btnB = document.createElement("button");
    container.append(btnA, btnB);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Escape вызывает onClose", () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y({ open: true, onClose, containerRef: { current: container } }));
    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("при открытии фокус уходит на первый фокусируемый в контейнере", () => {
    renderHook(() => useModalA11y({ open: true, onClose: () => {}, containerRef: { current: container } }));
    expect(document.activeElement).toBe(btnA);
  });

  it("initialFocusRef переопределяет начальный фокус", () => {
    renderHook(() =>
      useModalA11y({ open: true, onClose: () => {}, containerRef: { current: container }, initialFocusRef: { current: btnB } }),
    );
    expect(document.activeElement).toBe(btnB);
  });

  it("при закрытии (unmount) фокус возвращается на триггер", () => {
    const { unmount } = renderHook(() =>
      useModalA11y({ open: true, onClose: () => {}, containerRef: { current: container } }),
    );
    expect(document.activeElement).toBe(btnA);
    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it("trap=true зацикливает Tab (последний→первый) и Shift+Tab (первый→последний)", () => {
    renderHook(() =>
      useModalA11y({ open: true, onClose: () => {}, containerRef: { current: container }, trap: true }),
    );
    btnB.focus();
    press("Tab");
    expect(document.activeElement).toBe(btnA);
    btnA.focus();
    press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(btnB);
  });

  it("trap=false не зацикливает Tab", () => {
    renderHook(() =>
      useModalA11y({ open: true, onClose: () => {}, containerRef: { current: container }, trap: false }),
    );
    btnB.focus();
    press("Tab");
    // jsdom сам фокус по Tab не двигает, а хук при trap=false не вмешивается → остаёмся на btnB
    expect(document.activeElement).toBe(btnB);
  });

  it("open=false — хук неактивен, Escape игнорируется", () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y({ open: false, onClose, containerRef: { current: container } }));
    press("Escape");
    expect(onClose).not.toHaveBeenCalled();
  });
});
