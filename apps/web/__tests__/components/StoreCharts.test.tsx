import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HealthTrend, LostRevenueTrend, SegmentPie, DeadInventoryChart } from "@/app/dashboard/StoreCharts";

describe("StoreCharts: HealthTrend", () => {
  it("при <2 точках показывает 'Накапливается история'", () => {
    render(<HealthTrend history={[]} />);
    expect(screen.getByText(/Накапливается история/i)).toBeInTheDocument();
  });

  it("при 1 точке тоже заглушка", () => {
    render(<HealthTrend history={[
      { period_end: "2026-05-01", warehouse_health_score: 80, lost_revenue: 100, total_inventory_value: 1000 },
    ]} />);
    expect(screen.getByText(/Накапливается история/i)).toBeInTheDocument();
  });

  it("при ≥2 точках график рендерится", () => {
    const { container } = render(<HealthTrend history={[
      { period_end: "2026-05-01", warehouse_health_score: 80, lost_revenue: 100, total_inventory_value: 1000 },
      { period_end: "2026-05-02", warehouse_health_score: 85, lost_revenue: 110, total_inventory_value: 1050 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
    expect(screen.queryByText(/Накапливается история/i)).not.toBeInTheDocument();
  });

  it("обрабатывает null health_score", () => {
    const { container } = render(<HealthTrend history={[
      { period_end: "2026-05-01", warehouse_health_score: null, lost_revenue: 0, total_inventory_value: 0 },
      { period_end: "2026-05-02", warehouse_health_score: 75, lost_revenue: 0, total_inventory_value: 0 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe("StoreCharts: LostRevenueTrend", () => {
  it("при <2 точках — заглушка", () => {
    render(<LostRevenueTrend history={[]} />);
    expect(screen.getByText(/Накапливается история/i)).toBeInTheDocument();
  });

  it("при ≥2 точках график", () => {
    const { container } = render(<LostRevenueTrend history={[
      { period_end: "2026-05-01", warehouse_health_score: 80, lost_revenue: 500, total_inventory_value: 1000 },
      { period_end: "2026-05-02", warehouse_health_score: 85, lost_revenue: 750, total_inventory_value: 1050 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("null lost_revenue → 0", () => {
    const { container } = render(<LostRevenueTrend history={[
      { period_end: "2026-05-01", warehouse_health_score: 80, lost_revenue: null, total_inventory_value: 1000 },
      { period_end: "2026-05-02", warehouse_health_score: 85, lost_revenue: 100, total_inventory_value: 1050 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe("StoreCharts: SegmentPie", () => {
  it("null distribution → 'Нет данных по сегментам'", () => {
    render(<SegmentPie distribution={null} />);
    expect(screen.getByText(/Нет данных по сегментам/i)).toBeInTheDocument();
  });

  it("пустой объект → 'Нет данных по сегментам'", () => {
    render(<SegmentPie distribution={{}} />);
    expect(screen.getByText(/Нет данных по сегментам/i)).toBeInTheDocument();
  });

  it("известные сегменты — рендерится PieChart", () => {
    const { container } = render(<SegmentPie distribution={{
      fast_movers: 5, stable: 10, slow_movers: 3, dead_inventory_risk: 2, insufficient_data: 1,
    }} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("неизвестный сегмент — fallback цвет", () => {
    const { container } = render(<SegmentPie distribution={{ weird_segment: 7 }} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe("StoreCharts: DeadInventoryChart", () => {
  it("при <2 точках — 'Накапливается история'", () => {
    render(<DeadInventoryChart history={[]} />);
    expect(screen.getByText(/Накапливается история/i)).toBeInTheDocument();
  });

  it("при ≥2 точках ComposedChart", () => {
    const { container } = render(<DeadInventoryChart history={[
      { period_end: "2026-05-01", dead_inventory_sku_count: 1, store_frozen_inventory_value: 100 },
      { period_end: "2026-05-02", dead_inventory_sku_count: 2, store_frozen_inventory_value: 200 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("null/undefined → 0", () => {
    const { container } = render(<DeadInventoryChart history={[
      { period_end: "2026-05-01", dead_inventory_sku_count: 1, store_frozen_inventory_value: null },
      { period_end: "2026-05-02", dead_inventory_sku_count: 2 },
    ]} />);
    expect(container.firstChild).toBeTruthy();
  });
});
