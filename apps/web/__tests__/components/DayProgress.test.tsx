import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DayProgress } from "@/app/dashboard/DayProgress";

describe("DayProgress", () => {
  it("Day 0: 'Данные записаны' + обещает через 7 дней", () => {
    render(<DayProgress daysSinceSetup={0} />);
    expect(screen.getByText("Данные записаны")).toBeInTheDocument();
    expect(screen.getByText(/Через 7 дней/i)).toBeInTheDocument();
  });

  it("Day 1: '1 день' (плюрализация)", () => {
    render(<DayProgress daysSinceSetup={1} />);
    expect(screen.getByText("Первые расчёты готовы")).toBeInTheDocument();
    expect(screen.getByText(/Прошло 1 день/)).toBeInTheDocument();
  });

  it("Day 3: '3 дня'", () => {
    render(<DayProgress daysSinceSetup={3} />);
    expect(screen.getByText(/Прошло 3 дня/)).toBeInTheDocument();
  });

  it("Day 5: '5 дней'", () => {
    render(<DayProgress daysSinceSetup={5} />);
    expect(screen.getByText(/Прошло 5 дней/)).toBeInTheDocument();
  });

  it("Day 7+: переход в 'day30' stage", () => {
    render(<DayProgress daysSinceSetup={7} />);
    expect(screen.getByText("Аналитика накапливается")).toBeInTheDocument();
  });

  it("Day 11: '11 дней' (lastTwo 11-14)", () => {
    render(<DayProgress daysSinceSetup={11} />);
    expect(screen.getByText(/Прошло 11 дней/)).toBeInTheDocument();
  });

  it("Day 21: '21 день'", () => {
    render(<DayProgress daysSinceSetup={21} />);
    expect(screen.getByText(/Прошло 21 день/)).toBeInTheDocument();
  });

  it("Day 22: '22 дня'", () => {
    render(<DayProgress daysSinceSetup={22} />);
    expect(screen.getByText(/Прошло 22 дня/)).toBeInTheDocument();
  });

  it("Day 25: '25 дней'", () => {
    render(<DayProgress daysSinceSetup={25} />);
    expect(screen.getByText(/Прошло 25 дней/)).toBeInTheDocument();
  });

  it("Day 30+: скрывается (null)", () => {
    const { container } = render(<DayProgress daysSinceSetup={30} />);
    expect(container.firstChild).toBeNull();
  });

  it("Day 100: тоже скрыт", () => {
    const { container } = render(<DayProgress daysSinceSetup={100} />);
    expect(container.firstChild).toBeNull();
  });

  it("ссылка 'Подробнее' на /onboarding", () => {
    render(<DayProgress daysSinceSetup={0} />);
    const link = screen.getByRole("link", { name: /Подробнее/i });
    expect(link).toHaveAttribute("href", "/onboarding");
  });
});
