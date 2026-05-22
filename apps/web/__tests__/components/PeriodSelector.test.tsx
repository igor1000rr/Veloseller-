import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PeriodSelector } from "@/app/dashboard/PeriodSelector";

describe("PeriodSelector", () => {
  it("рендерит 3 опции 7/30/90 дней", () => {
    render(<PeriodSelector current="30" />);
    expect(screen.getByText("7 дней")).toBeInTheDocument();
    expect(screen.getByText("30 дней")).toBeInTheDocument();
    expect(screen.getByText("3 месяца")).toBeInTheDocument();
  });

  // Палитра обновлена: bg-slate-900 → bg-ink (ремские токены).
  it("текущий период подсвечивается черным фоном", () => {
    render(<PeriodSelector current="7" />);
    const link7 = screen.getByText("7 дней").closest("a")!;
    const link30 = screen.getByText("30 дней").closest("a")!;
    expect(link7.className).toMatch(/bg-ink/);
    expect(link30.className).not.toMatch(/bg-ink(?!\-)/);
  });

  it("ссылки содержат basePath + query", () => {
    render(<PeriodSelector current="30" basePath="/dashboard/dynamics" />);
    const link7 = screen.getByText("7 дней").closest("a")!;
    expect(link7.getAttribute("href")).toBe("/dashboard/dynamics?period=7");
  });

  it("basePath по умолчанию /dashboard", () => {
    render(<PeriodSelector current="7" />);
    const link30 = screen.getByText("30 дней").closest("a")!;
    expect(link30.getAttribute("href")).toBe("/dashboard?period=30");
  });
});
