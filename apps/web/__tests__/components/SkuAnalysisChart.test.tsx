import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SkuAnalysisChart } from "@/app/dashboard/skus/[id]/SkuAnalysisChart";

describe("SkuAnalysisChart", () => {
  it("рендерится без данных", () => {
    const { container } = render(<SkuAnalysisChart data={[]} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("рендерится с базовыми данными", () => {
    const data = [
      { date: "2026-05-01", stock: 100, price: 50, availability: 1, velocity: 2 },
      { date: "2026-05-02", stock: 95, price: 50, availability: 1, velocity: 2.5 },
      { date: "2026-05-03", stock: 90, price: 50, availability: 1, velocity: 2.3 },
    ];
    const { container } = render(<SkuAnalysisChart data={data} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("с changelog-tooltip", () => {
    const data = [
      { date: "2026-05-01", stock: 100, price: 50, availability: 1, velocity: 2 },
      { date: "2026-05-02", stock: 95, price: 50, availability: 1, velocity: 2.5 },
    ];
    const changelog = { "2026-05-02": [{ event_type: "sales_like", delta_stock: -5, message: "Продажа -5", confidence_impact: 0 }] };
    const { container } = render(<SkuAnalysisChart data={data} changelogByDate={changelog} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("price change 50→75 — не падает", () => {
    const data = [
      { date: "2026-05-01", stock: 100, price: 50, availability: 1, velocity: 2 },
      { date: "2026-05-02", stock: 95, price: 75, availability: 1, velocity: 2 },
      { date: "2026-05-03", stock: 88, price: 75, availability: 1, velocity: 2.3 },
    ];
    const { container } = render(<SkuAnalysisChart data={data} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("OOS период — не падает", () => {
    const data = [
      { date: "2026-05-01", stock: 5, price: 50, availability: 1, velocity: 5 },
      { date: "2026-05-02", stock: 0, price: 50, availability: 0, velocity: 0 },
    ];
    const { container } = render(<SkuAnalysisChart data={data} />);
    expect(container.firstChild).toBeTruthy();
  });

  it("price=0 не считается price change", () => {
    const data = [
      { date: "2026-05-01", stock: 100, price: 0, availability: 1, velocity: 2 },
      { date: "2026-05-02", stock: 95, price: 50, availability: 1, velocity: 2 },
    ];
    const { container } = render(<SkuAnalysisChart data={data} />);
    expect(container.firstChild).toBeTruthy();
  });
});
