/**
 * Тесты HealthScale (Rule 13.2): 5 тиров по порогам 40/60/75/90.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HealthScale, HealthScoreBlock } from "../../app/dashboard/HealthScale";

describe("HealthScale", () => {
  it("показывает 'нет данных' для null", () => {
    const { container } = render(<HealthScale score={null} />);
    expect(container.textContent).toContain("нет данных");
  });

  it("показывает 'нет данных' для undefined", () => {
    const { container } = render(<HealthScale score={undefined} />);
    expect(container.textContent).toContain("нет данных");
  });

  it("рендерит Excellent для score ≥ 90", () => {
    const { container } = render(<HealthScale score={95} />);
    expect(container.textContent).toContain("Excellent");
  });

  it("граница Excellent — ровно 90", () => {
    const { container } = render(<HealthScale score={90} />);
    expect(container.textContent).toContain("Excellent");
  });

  it("рендерит Good для score 75-89", () => {
    const { container } = render(<HealthScale score={80} />);
    expect(container.textContent).toContain("Good");
  });

  it("рендерит Warning для score 60-74", () => {
    const { container } = render(<HealthScale score={65} />);
    expect(container.textContent).toContain("Warning");
  });

  it("рендерит Risky для score 40-59", () => {
    const { container } = render(<HealthScale score={45} />);
    expect(container.textContent).toContain("Risky");
  });

  it("рендерит Critical для score < 40", () => {
    const { container } = render(<HealthScale score={20} />);
    expect(container.textContent).toContain("Critical");
  });

  it("граница Critical/Risky — ровно 40 → Risky", () => {
    const { container } = render(<HealthScale score={40} />);
    expect(container.textContent).toContain("Risky");
  });

  it("score = 0 → Critical", () => {
    const { container } = render(<HealthScale score={0} />);
    expect(container.textContent).toContain("Critical");
  });

  it("принимает prop size без ошибок", () => {
    const { container: c1 } = render(<HealthScale score={50} size="sm" />);
    const { container: c2 } = render(<HealthScale score={50} size="lg" />);
    expect(c1.textContent).toContain("Risky");
    expect(c2.textContent).toContain("Risky");
  });
});

describe("HealthScoreBlock", () => {
  it("показывает числовое значение и /100", () => {
    const { container } = render(<HealthScoreBlock score={82} />);
    expect(container.textContent).toContain("82");
    expect(container.textContent).toContain("/100");
  });

  it("показывает — для null", () => {
    const { container } = render(<HealthScoreBlock score={null} />);
    expect(container.textContent).toContain("—");
  });

  it("содержит бейдж HealthScale внутри блока", () => {
    const { container } = render(<HealthScoreBlock score={95} />);
    expect(container.textContent).toContain("Excellent");
    expect(container.textContent).toContain("95");
  });

  it("выводит подсказку (hint) соответствующую тиру", () => {
    const { container } = render(<HealthScoreBlock score={20} />);
    expect(container.textContent).toContain("Критическое состояние");
  });
});
