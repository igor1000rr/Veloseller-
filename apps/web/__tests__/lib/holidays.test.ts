import { describe, it, expect } from "vitest";
import { getHolidayEventsInRange, getPreHolidayWindow } from "@/lib/holidays";

describe("getHolidayEventsInRange", () => {
  it("23 февраля: окно начинается за 7 дней (16.02)", () => {
    const evs = getHolidayEventsInRange("2026-02-01", "2026-02-28");
    const feb23 = evs.find((e) => e.endDate === "2026-02-23");
    expect(feb23).toBeTruthy();
    expect(feb23!.startDate).toBe("2026-02-16");
    expect(feb23!.source).toBe("holiday");
    expect(feb23!.title).toBe("23 февраля");
  });

  it("Новый год: окно 14 дней (18.12 → 01.01 след. года)", () => {
    const evs = getHolidayEventsInRange("2025-12-01", "2026-01-10");
    const ny = evs.find((e) => e.endDate === "2026-01-01");
    expect(ny).toBeTruthy();
    expect(ny!.startDate).toBe("2025-12-18");
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

  it("невалидный/перевёрнутый диапазон → пусто", () => {
    expect(getHolidayEventsInRange("2026-05-10", "2026-02-10")).toEqual([]);
    expect(getHolidayEventsInRange("", "")).toEqual([]);
  });
});

describe("getPreHolidayWindow (регресс существующей логики)", () => {
  it("внутри окна 23 февраля", () => {
    const w = getPreHolidayWindow(new Date("2026-02-18T12:00:00Z"));
    expect(w).toBeTruthy();
    expect(w!.holidayDate).toBe("2026-02-23");
    expect(w!.daysBefore).toBe(7);
  });

  it("вне любых окон → null", () => {
    expect(getPreHolidayWindow(new Date("2026-05-15T12:00:00Z"))).toBeNull();
  });
});
