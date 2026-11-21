// Генерация свободных стартов слотов над хранилищем (issue #11).
// Окно записи - 14 календарных дней от текущего дня, рабочее время
// пн-пт 09:00-18:00, шаг слотов 30 минут - всё в поясе владельца
// (ADR 0002). Прошедшие старты исключаются на момент запроса,
// пересечения со встречами запрещены, встречи «вплотную» разрешены.
// Текущее время инъецируется параметром now - детерминизм в тестах.

import type { MeetingRecord, MeetingTypeRecord } from "./store.js";

/** Окно записи: 14 календарных дней, начиная с текущего (контракт). */
export const BOOKING_WINDOW_DAYS = 14;

/** Пояс владельца: в нём считаются окно записи и рабочее время (ADR 0002). */
export const OWNER_TIMEZONE = "Europe/Moscow";

const SLOT_STEP_MINUTES = 30;
const DAY_MINUTES = 24 * 60;
const DAY_MS = 86_400_000;
const WORK_START_MINUTES = 9 * 60;
const WORK_END_MINUTES = 18 * 60;
const MINUTE_MS = 60_000;

/** Смещение пояса в момент instant: «GMT+03:00» из Intl в миллисекунды. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const timeZoneName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(timeZoneName ?? "");
  if (!match) {
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3])) * MINUTE_MS;
}

/** Календарная дата и минута суток instant-а в заданном поясе. */
function wallTime(instant: Date, timeZone: string) {
  const shifted = new Date(
    instant.getTime() + timeZoneOffsetMs(instant, timeZone),
  );
  return {
    year: shifted.getUTCFullYear(),
    // Месяц 0-индексный - удобно для Date.UTC.
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** Мгновенье UTC заданных календарной даты и минуты суток в поясе. */
function wallToInstant(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): number {
  // Полдень - внутри любых смещений пояса, поэтому год-месяц-день
  //(offset не переносит через сутки).
  const offset = timeZoneOffsetMs(
    new Date(Date.UTC(year, month, day, 12)),
    timeZone,
  );
  return Date.UTC(year, month, day, 0, minuteOfDay) - offset;
}

/** Пересекается ли слот типа со встречами - слот занимает время
 * со старта startMs до startMs + durationMs (встречи «вплотную» разрешены,
 * issue #12). Наложение запрещено: время слота и встречи пересекается,
 * когда старт одного раньше конца другого, а строгое неравенство
 * оставляет соприкасающиеся слоты свободными.
 */
export function overlapsMeetings(
  types: readonly MeetingTypeRecord[],
  meetings: readonly MeetingRecord[],
  startMs: number,
  durationMs: number,
): boolean {
  const durationByType = new Map(
    types.map((type) => [type.id, type.durationMinutes * MINUTE_MS]),
  );
  return meetings.some((meeting) => {
    const busyStart = Date.parse(meeting.startsAt);
    const busyEnd = busyStart + (durationByType.get(meeting.typeId) ?? 0);
    return busyStart < startMs + durationMs && startMs < busyEnd;
  });
}

export function generateFreeStarts(
  types: readonly MeetingTypeRecord[],
  meetings: readonly MeetingRecord[],
  bookingType: MeetingTypeRecord,
  now: Date,
): string[] {
  const slotDurationMs = bookingType.durationMinutes * MINUTE_MS;

  const today = wallTime(now, OWNER_TIMEZONE);
  const starts: string[] = [];
  for (let dayOffset = 0; dayOffset < BOOKING_WINDOW_DAYS; dayOffset += 1) {
    const day = new Date(
      Date.UTC(today.year, today.month, today.day + dayOffset),
    );
    // Кандидаты - вся сетка 30 минут суток пояса владельца; отбор
    // валидной позиции слота - общий предикат с бронированием.
    for (
      let minuteOfDay = 0;
      minuteOfDay < DAY_MINUTES;
      minuteOfDay += SLOT_STEP_MINUTES
    ) {
      const startMs = wallToInstant(
        day.getUTCFullYear(),
        day.getUTCMonth(),
        day.getUTCDate(),
        minuteOfDay,
        OWNER_TIMEZONE,
      );
      if (!isSlotPosition(bookingType, startMs, now)) {
        continue;
      }
      // Пересечение запрещено, вплотную разрешено - предикат общий
      // с бронированием (issue #12).
      if (overlapsMeetings(types, meetings, startMs, slotDurationMs)) {
        continue;
      }
      starts.push(new Date(startMs).toISOString());
    }
  }
  return starts;
}

/** Валидная позиция старта слота типа: окно записи 14 календарных дней,
 * рабочие дни пн-пт и часы 09:00-18:00, сетка 30 минут, не в прошлом.
 * Слот типа занимает время со старта до старта плюс длительность типа -
 * она должна умещаться до конца рабочего дня. Наложения со встречами
 * здесь не проверяются (issue #12).
 */
export function isSlotPosition(
  bookingType: MeetingTypeRecord,
  startMs: number,
  now: Date,
): boolean {
  const start = wallTime(new Date(startMs), OWNER_TIMEZONE);
  // Прошедшие старты исключены (контракт).
  if (startMs < now.getTime()) {
    return false;
  }
  // Окно записи: 14 календарных дней, начиная с текущего (контракт).
  const today = wallTime(now, OWNER_TIMEZONE);
  const dayOffset =
    (Date.UTC(start.year, start.month, start.day) -
      Date.UTC(today.year, today.month, today.day)) /
    DAY_MS;
  if (!Number.isInteger(dayOffset) || dayOffset < 0) {
    return false;
  }
  if (dayOffset >= BOOKING_WINDOW_DAYS) {
    return false;
  }
  // Рабочие дни - понедельник по пятницу (контракт).
  if (start.weekday === 0 || start.weekday === 6) {
    return false;
  }
  // Старты - на шаге сетки 30 минут (контракт).
  if (start.minuteOfDay % SLOT_STEP_MINUTES !== 0) {
    return false;
  }
  // Рабочие часы 09:00-18:00 (контракт).
  if (
    start.minuteOfDay < WORK_START_MINUTES ||
    start.minuteOfDay + bookingType.durationMinutes > WORK_END_MINUTES
  ) {
    return false;
  }
  return true;
}
