/**
 * Предпраздничные окна для автоподстановки дат в фильтре SKU (Игорь 27.05.2026)
 * и для автозаполнения календаря событий (виртуальные праздничные события).
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
  /** Название в родительном падеже («…до Нового года»). */
  name: string;
  /** Название для календаря событий (именительный падеж). */
  calendarName: string;
};

const HOLIDAYS: HolidayDef[] = [
  { month: 1,  day: 1,  daysBefore: 14, name: "Нового года", calendarName: "Новый год" },
  { month: 2,  day: 14, daysBefore: 7,  name: "14 февраля",  calendarName: "14 февраля" },
  { month: 2,  day: 23, daysBefore: 7,  name: "23 февраля",  calendarName: "23 февраля" },
  { month: 3,  day: 8,  daysBefore: 7,  name: "8 марта",     calendarName: "8 марта" },
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

/** Виртуальное праздничное событие для календаря (в БД не хранится, read-only). */
export type HolidayEvent = {
  /** Стабильный id вида holiday-2026-2-23 (для React-ключей). */
  id: string;
  /** Название праздника. */
  title: string;
  /** Начало предпраздничного окна (holiday - daysBefore), YYYY-MM-DD. */
  startDate: string;
  /** День праздника, YYYY-MM-DD. */
  endDate: string;
  /** Подсказка про предпраздничный пик. */
  comment: string;
  /** Маркер источника — отличает от пользовательских событий. */
  source: "holiday";
};

/**
 * Виртуальные праздничные события, чьё окно [holiday - daysBefore .. holiday]
 * пересекает диапазон [fromISO, toISO] (обе границы включительно, YYYY-MM-DD).
 *
 * Используется для автозаполнения календаря: на карточке товара и в общем
 * календаре склада праздники показываются автоматически, чтобы за 3 месяца
 * подготовиться к пику. Сортировка — по дате начала.
 */
export function getHolidayEventsInRange(fromISO: string, toISO: string): HolidayEvent[] {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T23:59:59Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];

  const startYear = new Date(from).getUTCFullYear() - 1;
  const endYear = new Date(to).getUTCFullYear() + 1;
  const out: HolidayEvent[] = [];

  for (let y = startYear; y <= endYear; y++) {
    for (const h of HOLIDAYS) {
      const holiday = new Date(Date.UTC(y, h.month - 1, h.day));
      const winStart = new Date(holiday);
      winStart.setUTCDate(holiday.getUTCDate() - h.daysBefore);
      // Пересечение [winStart, holiday] с [from, to].
      if (holiday.getTime() < from || winStart.getTime() > to) continue;
      out.push({
        id: `holiday-${y}-${h.month}-${h.day}`,
        title: h.calendarName,
        startDate: isoDateUtc(winStart),
        endDate: isoDateUtc(holiday),
        comment: `Предпраздничный пик продаж — подготовьте остатки за ${h.daysBefore} дн.`,
        source: "holiday",
      });
    }
  }
  out.sort((a, b) => a.startDate.localeCompare(b.startDate));
  return out;
}
