import { describe, it, expect } from "vitest";
import { getHolidayEventsInRange, getPreHolidayWindow } from "@/lib/holidays";

describe("getHolidayEventsInRange", () => {
  it("23 февраля: окно начинается за 14 дней (09.02)", () => {
    const evs = getHolidayEventsInRange("2026-02-01", "2026-02-28");
    const feb23 = evs.find((e) => e.endDate === "2026-02-23");
    expect(feb23).toBeTruthy();
    expect(feb23!.startDate).toBe("2026-02-09");
    expect(feb23!.source).toBe("holiday");
    expect(feb23!.title).toBe("23 февраля");
  });

  it("8 марта: окно начинается за 14 дней (22.02)", () => {
    const evs = getHolidayEventsInRange("2026-02-01", "2026-03-31");
    const mar8 = evs.find((e) => e.endDate === "2026-03-08");
    expect(mar8).toBeTruthy();
    expect(mar8!.startDate).toBe("2026-02-22");
  });

  it("11.11: окно начинается за 7 дней (04.11)", () => {
    const evs = getHolidayEventsInRange("2026-11-01", "2026-11-30");
    const d = evs.find((e) => e.endDate === "2026-11-11");
    expect(d).toBeTruthy();
    expect(d!.startDate).toBe("2026-11-04");
    expect(d!.title).toBe("Распродажа 11.11");
  });

  it("Новый год: окно 21 день, привязка к 31.12 (10.12 → 31.12)", () => {
    const evs = getHolidayEventsInRange("2026-12-01", "2026-12-31");
    const ny = evs.find((e) => e.endDate === "2026-12-31");
    expect(ny).toBeTruthy();
    expect(ny!.startDate).toBe("2026-12-10");
    expect(ny!.title).toBe("Новый год");
  });

  it("диапазон без праздников → пусто", () => {
    expect(getHolidayEventsInRange("2026-05-01", "2026-05-31")).toEqual([]);
  });

  it("3 месяца с середины февраля включают 14.02, 23.02 и 08.03", () => {
    const evs = getHolidayEventsInRange("2026-02-10", "2026-05-10");
    const ends = evs.map((e) => e.endDate);
    expect(ends).toContain("2026-02-14");
    expect(ends).toContain("2026-02-23");
    expect(ends).toContain("2026-03-08");
  });

  it("повторяется каждый год автоматически (8 марта 2027)", () => {
    const evs = getHolidayEventsInRange("2027-02-01", "2027-03-31");
    expect(evs.map((e) => e.endDate)).toContain("2027-03-08");
  });

  it("невалидный/перевёрнутый диапазон → пусто", () => {
    expect(getHolidayEventsInRange("2026-05-10", "2026-02-10")).toEqual([]);
    expect(getHolidayEventsInRange("", "")).toEqual([]);
  });
});

describe("getPreHolidayWindow (регресс существующей логики)", () => {
  it("внутри окна 23 февраля (теперь 14 дней)", () => {
    const w = getPreHolidayWindow(new Date("2026-02-18T12:00:00Z"));
    expect(w).toBeTruthy();
    expect(w!.holidayDate).toBe("2026-02-23");
    expect(w!.daysBefore).toBe(14);
  });

  it("вне любых окон → null", () => {
    expect(getPreHolidayWindow(new Date("2026-05-15T12:00:00Z"))).toBeNull();
  });
});
