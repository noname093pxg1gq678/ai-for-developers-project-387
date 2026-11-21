export function formatDuration(minutes: number): string {
  const ones = minutes % 10;
  const tens = minutes % 100;
  if (ones === 1 && tens !== 11) {
    return `${minutes} минута`;
  }
  if (ones >= 2 && ones <= 4 && (tens < 10 || tens >= 20)) {
    return `${minutes} минуты`;
  }
  return `${minutes} минут`;
}

// Пояс владельца для отображения времени (ADR 0002).
export const OWNER_TIMEZONE = "Europe/Moscow";

export function formatMeetingDateTime(startsAt: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: OWNER_TIMEZONE,
  }).format(new Date(startsAt));
}
