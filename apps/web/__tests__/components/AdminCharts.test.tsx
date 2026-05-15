import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RegistrationsChart,
  SnapshotsChart,
  PlansPieChart,
  ActivityChart,
} from "@/app/admin/AdminCharts";

// Утилита: проверяет что текст есть в textContent контейнера
// (более устойчиво к разбиению текста между элементами, чем getByText)
function hasText(container: HTMLElement, text: string): boolean {
  return (container.textContent || "").includes(text);
}

describe("AdminCharts: RegistrationsChart", () => {
  it("пустой массив → Empty 'Регистраций пока нет'", () => {
    const { container } = render(<RegistrationsChart data={[]} />);
    expect(hasText(container, "Регистраций пока нет")).toBe(true);
  });

  it("с данными — рендерит AreaChart", () => {
    const { container } = render(<RegistrationsChart data={[{ date: "05-01", count: 3 }, { date: "05-02", count: 5 }]} />);
    expect(hasText(container, "Регистраций пока нет")).toBe(false);
  });
});

describe("AdminCharts: SnapshotsChart", () => {
  it("пустой → 'Снимков нет'", () => {
    const { container } = render(<SnapshotsChart data={[]} />);
    expect(hasText(container, "Снимков нет")).toBe(true);
  });

  it("с данными — BarChart", () => {
    const { container } = render(<SnapshotsChart data={[{ date: "05-01", count: 100 }, { date: "05-02", count: 200 }]} />);
    expect(container.firstChild).toBeTruthy();
    expect(hasText(container, "Снимков нет")).toBe(false);
  });
});

describe("AdminCharts: PlansPieChart", () => {
  it("пустой массив → 'Селлеров нет'", () => {
    const { container } = render(<PlansPieChart data={[]} />);
    expect(hasText(container, "Селлеров нет")).toBe(true);
  });

  it("массив с count=0 для всех — тоже Empty", () => {
    const { container } = render(<PlansPieChart data={[{ plan: "trial", count: 0 }, { plan: "pro", count: 0 }]} />);
    expect(hasText(container, "Селлеров нет")).toBe(true);
  });

  it("реальные данные — отрисовывает Pie", () => {
    const { container } = render(<PlansPieChart data={[
      { plan: "trial", count: 5 }, { plan: "starter", count: 3 },
      { plan: "growth", count: 1 }, { plan: "pro", count: 1 },
    ]} />);
    expect(hasText(container, "Селлеров нет")).toBe(false);
  });

  it("неизвестный plan — fallback цвет", () => {
    const { container } = render(<PlansPieChart data={[{ plan: "unknown_plan", count: 2 }]} />);
    expect(hasText(container, "Селлеров нет")).toBe(false);
  });

  it("фильтрует count=0", () => {
    const { container } = render(<PlansPieChart data={[{ plan: "trial", count: 0 }, { plan: "pro", count: 5 }]} />);
    expect(hasText(container, "Селлеров нет")).toBe(false);
  });
});

describe("AdminCharts: ActivityChart", () => {
  it("пустой → 'Активности нет'", () => {
    const { container } = render(<ActivityChart data={[]} />);
    expect(hasText(container, "Активности нет")).toBe(true);
  });

  it("с данными — LineChart рендерится", () => {
    const { container } = render(<ActivityChart data={[
      { date: "05-01", snapshots: 100, recalcs: 5 },
      { date: "05-02", snapshots: 120, recalcs: 6 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
    expect(hasText(container, "Активности нет")).toBe(false);
  });
});
