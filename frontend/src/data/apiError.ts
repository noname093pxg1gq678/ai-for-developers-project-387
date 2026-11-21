// Общий модуль SDK-адаптеров: класс ошибки и конвертация ответа SDK
// (контракт - issue #1). Ошибки API превращаются в ApiError со статусом
// и понятным сообщением.

/** Ошибка запроса к API: статус HTTP и понятное сообщение. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Ошибка из тела ответа SDK, либо запасной текст. */
export function toApiError(
  status: number,
  body: unknown,
  fallback: string,
): ApiError {
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : fallback;
  return new ApiError(status, message);
}
