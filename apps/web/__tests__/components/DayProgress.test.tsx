import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayProgress } from "@/app/dashboard/DayProgress";

// Утилита: текст может быть разбит между элементами (font-display + spans),
// поэтому проверяем по textContent контейнера, а не через getByText.
function hasText(container: HTMLElement, text: string | RegExp): boolean {
  const content = container.textContent || "";
  return typeof text === "string" ? content.includes(text) : text.test(content);
}

describe("DayProgress", () => {
  it("Day 0: 'Данные записаны' + обещает через 7 дней", () => {
    const { container } = render(<DayProgress daysSinceSetup={0} />);
    expect(hasText(container, "Данные записаны")).toBe(true);
    expect(hasText(container, /Через 7 дней/i)).toBe(true);
  });

  it("Day 1: '1 день' (плюрализация)", () => {
    const { container } = render(<DayProgress daysSinceSetup={1} />);
    expect(hasText(container, "Первые расчёты в работе")).toBe(true);
    expect(hasText(container, /Прошло 1 день/)).toBe(true);
  });

  it("Day 3: '3 дня'", () => {
    const { container } = render(<DayProgress daysSinceSetup={3} />);
    expect(hasText(container, /Прошло 3 дня/)).toBe(true);
  });

  it("Day 5: '5 дней'", () => {
    const { container } = render(<DayProgress daysSinceSetup={5} />);
    expect(hasText(container, /Прошло 5 дней/)).toBe(true);
  });

  it("Day 7+: переход в 'day30' stage", () => {
    const { container } = render(<DayProgress daysSinceSetup={7} />);
    expect(hasText(container, "TVelo работает")).toBe(true);
  });

  it("Day 11: '11 дней' (lastTwo 11-14)", () => {
    const { container } = render(<DayProgress daysSinceSetup={11} />);
    expect(hasText(container, /Прошло 11 дней/)).toBe(true);
  });

  it("Day 21: '21 день'", () => {
    const { container } = render(<DayProgress daysSinceSetup={21} />);
    expect(hasText(container, /Прошло 21 день/)).toBe(true);
  });

  it("Day 22: '22 дня'", () => {
    const { container } = render(<DayProgress daysSinceSetup={22} />);
    expect(hasText(container, /Прошло 22 дня/)).toBe(true);
  });

  it("Day 25: '25 дней'", () => {
    const { container } = render(<DayProgress daysSinceSetup={25} />);
    expect(hasText(container, /Прошло 25 дней/)).toBe(true);
  });

  it("Day 30+: скрывается (null)", () => {
    const { container } = render(<DayProgress daysSinceSetup={30} />);
    expect(container.firstChild).toBeNull();
  });

  it("Day 100: тоже скрыт", () => {
    const { container } = render(<DayProgress daysSinceSetup={100} />);
    expect(container.firstChild).toBeNull();
  });

  it("ссылка 'Гид' на /onboarding", () => {
    render(<DayProgress daysSinceSetup={0} />);
    const link = screen.getByRole("link", { name: /Гид/i });
    expect(link).toHaveAttribute("href", "/onboarding");
  });

  it("показывает прогресс-полоску с Day 1 / Day 7 / Day 30", () => {
    const { container } = render(<DayProgress daysSinceSetup={3} />);
    expect(hasText(container, "Day 1")).toBe(true);
    expect(hasText(container, "Day 7")).toBe(true);
    expect(hasText(container, "Day 30")).toBe(true);
  });
});
