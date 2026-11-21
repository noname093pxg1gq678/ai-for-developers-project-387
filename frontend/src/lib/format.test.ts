import { describe, expect, it } from "vitest";
import { formatDuration, formatMeetingDateTime } from "./format";

describe("formatDuration", () => {
  it.each([
    [1, "1 минута"],
    [2, "2 минуты"],
    [5, "5 минут"],
    [11, "11 минут"],
    [15, "15 минут"],
    [20, "20 минут"],
    [21, "21 минута"],
    [22, "22 минуты"],
    [25, "25 минут"],
    [45, "45 минут"],
  ])("форматирует %i минут как «%s»", (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("formatMeetingDateTime", () => {
  it("переводит UTC-время в пояс владельца (ADR 0002)", () => {
    // 09:00 UTC = 12:00 в Europe/Moscow (UTC+3).
    expect(formatMeetingDateTime("2026-11-18T09:00:00Z")).toBe(
      "18.11.2026, 12:00",
    );
  });

  it("переводит дату через полночь при сдвиге пояса", () => {
    // 21:30 UTC = 00:30 следующего дня в Europe/Moscow.
    expect(formatMeetingDateTime("2026-11-18T21:30:00Z")).toBe(
      "19.11.2026, 00:30",
    );
  });
});
