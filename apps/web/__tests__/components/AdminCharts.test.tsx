import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RegistrationsChart,
  SnapshotsChart,
  PlansPieChart,
  ActivityChart,
} from "@/app/admin/AdminCharts";

describe("AdminCharts: RegistrationsChart", () => {
  it("пустой массив → Empty 'Регистраций пока нет'", () => {
    render(<RegistrationsChart data={[]} />);
    expect(screen.getByText("Регистраций пока нет")).toBeInTheDocument();
  });

  it("с данными — рендерит AreaChart", () => {
    render(<RegistrationsChart data={[{ date: "05-01", count: 3 }, { date: "05-02", count: 5 }]} />);
    expect(screen.queryByText(/Регистраций пока нет/)).not.toBeInTheDocument();
  });
});

describe("AdminCharts: SnapshotsChart", () => {
  it("пустой → 'Снимков нет'", () => {
    render(<SnapshotsChart data={[]} />);
    expect(screen.getByText("Снимков нет")).toBeInTheDocument();
  });

  it("с данными — BarChart", () => {
    const { container } = render(<SnapshotsChart data={[{ date: "05-01", count: 100 }, { date: "05-02", count: 200 }]} />);
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText("Снимков нет")).not.toBeInTheDocument();
  });
});

describe("AdminCharts: PlansPieChart", () => {
  it("пустой массив → 'Селлеров нет'", () => {
    render(<PlansPieChart data={[]} />);
    expect(screen.getByText("Селлеров нет")).toBeInTheDocument();
  });

  it("массив с count=0 для всех — тоже Empty", () => {
    render(<PlansPieChart data={[{ plan: "trial", count: 0 }, { plan: "pro", count: 0 }]} />);
    expect(screen.getByText("Селлеров нет")).toBeInTheDocument();
  });

  it("реальные данные — отрисовывает Pie", () => {
    render(<PlansPieChart data={[
      { plan: "trial", count: 5 }, { plan: "starter", count: 3 },
      { plan: "growth", count: 1 }, { plan: "pro", count: 1 },
    ]} />);
    expect(screen.queryByText("Селлеров нет")).not.toBeInTheDocument();
  });

  it("неизвестный plan — fallback цвет (slate)", () => {
    render(<PlansPieChart data={[{ plan: "unknown_plan", count: 2 }]} />);
    expect(screen.queryByText("Селлеров нет")).not.toBeInTheDocument();
  });

  it("фильтрует count=0", () => {
    render(<PlansPieChart data={[{ plan: "trial", count: 0 }, { plan: "pro", count: 5 }]} />);
    expect(screen.queryByText("Селлеров нет")).not.toBeInTheDocument();
  });
});

describe("AdminCharts: ActivityChart", () => {
  it("пустой → 'Активности нет'", () => {
    render(<ActivityChart data={[]} />);
    expect(screen.getByText("Активности нет")).toBeInTheDocument();
  });

  it("с данными — LineChart рендерится", () => {
    const { container } = render(<ActivityChart data={[
      { date: "05-01", snapshots: 100, recalcs: 5 },
      { date: "05-02", snapshots: 120, recalcs: 6 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText("Активности нет")).not.toBeInTheDocument();
  });
});
