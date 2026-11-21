// Адаптер публичных поверхностей (страница гостя и заглушка записи) над
// сгенерированным SDK (контракт - issue #1). Ошибки API превращаются
// в ApiError со статусом и понятным сообщением.

import {
  bookingsCreate,
  meetingTypesListSlots,
  meetingTypesListTypes,
} from "../api";
import type { BookingInput, Meeting, MeetingType } from "../api";
import { ApiError, toApiError } from "./apiError";

// Алиас общего класса ошибки для читаемости мест использования на публичной
// странице.
export { ApiError as PublicApiError };

function toPublicApiError(status: number, body: unknown): ApiError {
  return toApiError(status, body, "Не удалось загрузить данные");
}

export async function loadMeetingTypes(): Promise<MeetingType[]> {
  const result = await meetingTypesListTypes();
  if (result.error) {
    throw toPublicApiError(result.response?.status ?? 0, result.error);
  }
  return result.data ?? [];
}

/** Свободные старты слотов окна записи, UTC ISO-строки (контракт, issue #11). */
export async function loadBookingSlots(typeId: string): Promise<string[]> {
  const result = await meetingTypesListSlots({ path: { typeId } });
  if (result.error) {
    throw toPublicApiError(result.response?.status ?? 0, result.error);
  }
  return result.data ?? [];
}

/** Бронирование свободного слота: 201 с данными встречи (контракт, issue #12). */
export async function createBooking(input: BookingInput): Promise<Meeting> {
  const result = await bookingsCreate({ body: input });
  if (result.error) {
    throw toPublicApiError(result.response?.status ?? 0, result.error);
  }
  return result.data;
}
