import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HealthKpi } from "@/app/dashboard/skus/[id]/HealthTooltip";
import {
  buildHealthBreakdown, buildConfidenceBreakdown,
} from "@/app/dashboard/skus/[id]/health-breakdown";

describe("HealthKpi", () => {
  it("показывает label и value", () => {
    render(<HealthKpi label="Health" value="85" breakdown={[]} />);
    expect(screen.getByText("Health")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("breakdown скрыт по умолчанию", () => {
    render(<HealthKpi label="X" value="1" breakdown={[{ label: "Test", value: "−5" }]} />);
    expect(screen.queryByText("Причины")).not.toBeInTheDocument();
  });

  it("показывает breakdown при mouseEnter", () => {
    render(<HealthKpi label="X" value="1" breakdown={[{ label: "Stockout", value: "−6.7", tone: "bad" }]} />);
    fireEvent.mouseEnter(screen.getByText("X").closest("div")!.parentElement!);
    expect(screen.getByText("Причины")).toBeInTheDocument();
  });

  it("скрывает при mouseLeave", () => {
    render(<HealthKpi label="X" value="1" breakdown={[{ label: "A", value: "1" }]} />);
    const card = screen.getByText("X").closest("div")!.parentElement!;
    fireEvent.mouseEnter(card);
    fireEvent.mouseLeave(card);
    expect(screen.queryByText("Причины")).not.toBeInTheDocument();
  });

  it("акценты violet/teal/blue", () => {
    const { rerender, container } = render(<HealthKpi label="X" value="1" breakdown={[]} accent="violet" />);
    expect(container.querySelector(".border-l-violet-500")).toBeInTheDocument();
    rerender(<HealthKpi label="X" value="1" breakdown={[]} accent="teal" />);
    expect(container.querySelector(".border-l-teal-500")).toBeInTheDocument();
    rerender(<HealthKpi label="X" value="1" breakdown={[]} accent="blue" />);
    expect(container.querySelector(".border-l-blue-500")).toBeInTheDocument();
  });

  it("пустой breakdown при hover — поповер НЕ показывается", () => {
    render(<HealthKpi label="X" value="1" breakdown={[]} />);
    fireEvent.mouseEnter(screen.getByText("X").closest("div")!.parentElement!);
    expect(screen.queryByText("Причины")).not.toBeInTheDocument();
  });
});

describe("buildHealthBreakdown (формула Health score)", () => {
  it("null metric → пустой", () => {
    expect(buildHealthBreakdown(null)).toEqual([]);
  });

  it("нет проблем → 'Всё в порядке'", () => {
    const rows = buildHealthBreakdown({ in_stock_days: 30, stockout_days: 0, coverage_days: 60, confidence_score: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Всё в порядке");
  });

  it("stockout 30% → штраф −12.0", () => {
    const rows = buildHealthBreakdown({ in_stock_days: 21, stockout_days: 9, coverage_days: 30, confidence_score: 100 });
    const s = rows.find(r => r.label.includes("Stockout"));
    expect(s!.value).toBe("−12.0");
    expect(s!.tone).toBe("bad");
  });

  it("stockout 100% — макс 40", () => {
    const rows = buildHealthBreakdown({ in_stock_days: 0, stockout_days: 30, confidence_score: 50 });
    expect(rows.find(r => r.label.includes("Stockout"))!.value).toBe("−40.0");
  });

  it("низкое покрытие ≤7 → warn", () => {
    const rows = buildHealthBreakdown({ in_stock_days: 30, stockout_days: 0, coverage_days: 3, confidence_score: 100 });
    const c = rows.find(r => r.label.includes("Низкое покрытие"));
    expect(c!.value).toBe("−14.3");
  });

  it("неликвид >180 → warn (max 25)", () => {
    const rows = buildHealthBreakdown({ in_stock_days: 30, stockout_days: 0, coverage_days: 360, confidence_score: 100 });
    expect(rows.find(r => r.label.includes("Неликвид"))!.value).toBe("−25.0");
  });

  it("низкий confidence → штраф (100-c)*0.2", () => {
    const rows = buildHealthBreakdown({ in_stock_days: 30, stockout_days: 0, coverage_days: 50, confidence_score: 60 });
    expect(rows.find(r => r.label.includes("Confidence"))!.value).toBe("−8.0");
  });

  it("confidence=100 — без штрафа", () => {
    const rows = buildHealthBreakdown({ in_stock_days: 30, stockout_days: 0, coverage_days: 50, confidence_score: 100 });
    expect(rows.find(r => r.label.includes("Confidence"))).toBeUndefined();
  });
});

describe("buildConfidenceBreakdown", () => {
  // ВАЖНО: ключи в JSON соответствуют app/schemas.py:ConfidenceBreakdown:
  //   replenishment_like, anomaly_like, missing_data, low_history, initial, final
  // Раньше тесты (и сам код) использовали несуществующий суффикс *_penalty.
  it("null → []", () => {
    expect(buildConfidenceBreakdown(null)).toEqual([]);
    expect(buildConfidenceBreakdown({})).toEqual([]);
  });

  it("чистый → 'Все события чистые'", () => {
    const rows = buildConfidenceBreakdown({ confidence_breakdown: {
      replenishment_like: 0, anomaly_like: 0, missing_data: 0, low_history: 0,
    }});
    expect(rows[0].label).toBe("Все события чистые");
  });

  it("все три штрафа из спеки", () => {
    const rows = buildConfidenceBreakdown({ confidence_breakdown: {
      replenishment_like: 10, anomaly_like: 5, missing_data: 3.5, low_history: 0,
    }});
    expect(rows).toHaveLength(3);
    expect(rows.find(r => r.label === "Пополнения")!.value).toBe("−10.0%");
    expect(rows.find(r => r.label === "Аномалии")!.value).toBe("−5.0%");
    expect(rows.find(r => r.label === "Нет данных")!.value).toBe("−3.5%");
  });

  it("частичный — только активные", () => {
    const rows = buildConfidenceBreakdown({ confidence_breakdown: {
      replenishment_like: 7, anomaly_like: 0, missing_data: 0,
    }});
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Пополнения");
  });

  it("low_history штраф отображается (БАГ 4 fix)", () => {
    const rows = buildConfidenceBreakdown({ confidence_breakdown: {
      replenishment_like: 0, anomaly_like: 0, missing_data: 0, low_history: 25.0,
    }});
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Мало истории");
    expect(rows[0].value).toBe("−25.0%");
  });

  it("низкий confidence: missing + low_history вместе", () => {
    const rows = buildConfidenceBreakdown({ confidence_breakdown: {
      replenishment_like: 0, anomaly_like: 0, missing_data: 20, low_history: 15,
    }});
    expect(rows).toHaveLength(2);
    expect(rows.find(r => r.label === "Нет данных")!.value).toBe("−20.0%");
    expect(rows.find(r => r.label === "Мало истории")!.value).toBe("−15.0%");
  });
});
