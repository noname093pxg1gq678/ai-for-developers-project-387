// Адаптер панели владельца над сгенерированным SDK (контракт - issue #1).
// Ошибки API превращаются в ApiError со статусом и понятным сообщением.

import {
  meetingTypesCreateType,
  meetingTypesDeleteType,
  meetingTypesListTypes,
  meetingTypesUpdateType,
  meetingsList,
} from "../api";
import type { Meeting, MeetingType, MeetingTypeInput } from "../api";
import { ApiError, toApiError } from "./apiError";

// Алиас общего класса ошибки для читаемости мест использования в панели.
export { ApiError as PanelApiError };

function toPanelApiError(status: number, body: unknown): ApiError {
  return toApiError(status, body, "Не удалось выполнить запрос");
}

export async function loadPanelMeetingTypes(): Promise<MeetingType[]> {
  const result = await meetingTypesListTypes();
  if (result.error) {
    throw toPanelApiError(result.response?.status ?? 0, result.error);
  }
  return result.data ?? [];
}

export async function createPanelMeetingType(
  input: MeetingTypeInput,
): Promise<MeetingType> {
  const result = await meetingTypesCreateType({ body: input });
  if (result.error) {
    throw toPanelApiError(result.response?.status ?? 0, result.error);
  }
  return result.data;
}

export async function updatePanelMeetingType(
  id: string,
  input: MeetingTypeInput,
): Promise<MeetingType> {
  const result = await meetingTypesUpdateType({ path: { id }, body: input });
  if (result.error) {
    throw toPanelApiError(result.response?.status ?? 0, result.error);
  }
  return result.data;
}

export async function deletePanelMeetingType(id: string): Promise<void> {
  const result = await meetingTypesDeleteType({ path: { id } });
  if (result.error) {
    throw toPanelApiError(result.response?.status ?? 0, result.error);
  }
}

export async function loadPanelMeetings(): Promise<Meeting[]> {
  const result = await meetingsList();
  if (result.error) {
    throw toPanelApiError(result.response?.status ?? 0, result.error);
  }
  return result.data ?? [];
}
