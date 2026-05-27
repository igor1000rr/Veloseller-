/**
 * Предпраздничные окна для автоподстановки дат в фильтре SKU (Игорь 27.05.2026).
 *
 * Перед праздником на маркетплейсах всегда идёт пик продаж. Селлеру важно видеть
 * текущую скорость продаж именно в этот ужатый период, а не в обычный 30-дневный.
 *
 * Окна по Игорю:
 *   01.01 — за 14 дней до (18.12 — 31.12)
 *   14.02 — за 7 дней до (07.02 — 13.02)
 *   23.02 — за 7 дней до (16.02 — 22.02)
 *   08.03 — за 7 дней до (01.03 — 07.03)
 */

export type PreHolidayWindow = {
  /** Длительность окна в днях (7 или 14). */
  daysBefore: number;
  /** Читабельное название праздника. */
  holidayName: string;
  /** Дата самого праздника, YYYY-MM-DD. */
  holidayDate: string;
  /** Начало окна (holiday - daysBefore), YYYY-MM-DD. */
  windowStart: string;
  /** Конец окна (holiday - 1), YYYY-MM-DD. */
  windowEnd: string;
};

type HolidayDef = {
  month: number;
  day: number;
  daysBefore: number;
  name: string;
};

const HOLIDAYS: HolidayDef[] = [
  { month: 1,  day: 1,  daysBefore: 14, name: "Нового года" },
  { month: 2,  day: 14, daysBefore: 7,  name: "14 февраля" },
  { month: 2,  day: 23, daysBefore: 7,  name: "23 февраля" },
  { month: 3,  day: 8,  daysBefore: 7,  name: "8 марта" },
];

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Если today попадает в окно [holiday - N, holiday - 1] одного из праздников —
 * возвращаем параметры этого окна. Иначе null.
 *
 * Для Нового года проверяем и текущий, и следующий год (в декабре идёт отсчёт
 * до НГ следующего года).
 */
export function getPreHolidayWindow(today: Date): PreHolidayWindow | null {
  const year = today.getUTCFullYear();

  for (const h of HOLIDAYS) {
    // Кандидаты — текущий и следующий год (на случай НГ в декабре).
    for (const candidateYear of [year, year + 1]) {
      const holidayDate = new Date(Date.UTC(candidateYear, h.month - 1, h.day));
      const windowStart = new Date(holidayDate);
      windowStart.setUTCDate(holidayDate.getUTCDate() - h.daysBefore);
      const windowEnd = new Date(holidayDate);
      windowEnd.setUTCDate(holidayDate.getUTCDate() - 1);

      // today внутри [windowStart, windowEnd]?
      const todayMs = today.getTime();
      if (todayMs >= windowStart.getTime() && todayMs <= windowEnd.getTime() + 86400_000 - 1) {
        return {
          daysBefore: h.daysBefore,
          holidayName: h.name,
          holidayDate: isoDateUtc(holidayDate),
          windowStart: isoDateUtc(windowStart),
          windowEnd: isoDateUtc(windowEnd),
        };
      }
    }
  }
  return null;
}
