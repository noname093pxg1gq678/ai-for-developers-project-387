// Календарные дни окна записи и время слотов - всё в поясе владельца
// (ADR 0002, issue #11). Гость видит дни и старты по времени владельца.

import { OWNER_TIMEZONE } from "./format";

/** Окно записи: 14 календарных дней, начиная с текущего (контракт). */
export const BOOKING_WINDOW_DAYS = 14;

export interface BookingDay {
  /** Ключ календарного дня в поясе владельца: "2026-11-16". */
  key: string;
  /** Подпись дня: "пн, 16.11". */
  label: string;
}

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: OWNER_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayNumberFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: OWNER_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: OWNER_TIMEZONE,
  weekday: "short",
});

const slotTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: OWNER_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

/** Ключ календарного дня момента в поясе владельца: "ГГГГ-ММ-ДД". */
export function ownerDayKey(instant: Date): string {
  const parts = new Map(
    dayKeyFormatter
      .formatToParts(instant)
      .map((part) => [part.type, part.value] as const),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

/** Подпись дня по ключу "ГГГГ-ММ-ДД": "пн, 16.11". */
export function formatDayLabel(key: string): string {
  // Разбор ключа в полдень UTC: подпись не зависит от пояса браузера.
  const instant = new Date(`${key}T12:00:00Z`);
  return `${weekdayFormatter.format(instant)}, ${dayNumberFormatter.format(instant)}`;
}

/** Окно записи: count календарных дней начиная с текущего дня владельца.
 * Текущее время - параметр с дефолтом «сейчас»: инъекция для детерминизма
 * тестов.
 */
export function bookingWindowDays(
  count: number = BOOKING_WINDOW_DAYS,
  now: Date = new Date(),
): BookingDay[] {
  const [year, month, day] = ownerDayKey(now).split("-").map(Number);
  const days: BookingDay[] = [];
  for (let offset = 0; offset < count; offset += 1) {
    const calendarDay = new Date(Date.UTC(year, month - 1, day + offset));
    const key = calendarDay.toISOString().slice(0, 10);
    days.push({ key, label: formatDayLabel(key) });
  }
  return days;
}

/** Время старта слота в поясе владельца: "09:00". */
export function formatSlotTime(startsAt: string): string {
  return slotTimeFormatter.format(new Date(startsAt));
}

/** Свободные старты, сгруппированные по календарным дням владельца. */
export function groupSlotsByDay(slots: string[]): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  for (const slot of slots) {
    const key = ownerDayKey(new Date(slot));
    const daySlots = byDay.get(key);
    if (daySlots) {
      daySlots.push(slot);
    } else {
      byDay.set(key, [slot]);
    }
  }
  return byDay;
}
