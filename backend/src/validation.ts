// Валидация данных типа встречи по контракту: title до 100 и обязателен,
// description до 500 и обязателен, длительность - целые минуты 5-240.

export interface MeetingTypeBody {
  title: string;
  description: string;
  durationMinutes: number;
}

export type MeetingTypeValidation =
  | { input: MeetingTypeBody }
  | { error: string };

export function validateMeetingTypeBody(body: unknown): MeetingTypeValidation {
  if (typeof body !== "object" || body === null) {
    return {
      error:
        "Ожидается JSON-объект с полями title, description и durationMinutes",
    };
  }
  const { title, description, durationMinutes } = body as Record<
    string,
    unknown
  >;

  if (typeof title !== "string" || title.length === 0) {
    return { error: "Название обязательно" };
  }
  if (title.length > 100) {
    return { error: "Название не может быть длиннее 100 символов" };
  }
  if (typeof description !== "string" || description.length === 0) {
    return { error: "Описание обязательно" };
  }
  if (description.length > 500) {
    return { error: "Описание не может быть длиннее 500 символов" };
  }
  if (
    typeof durationMinutes !== "number" ||
    !Number.isInteger(durationMinutes)
  ) {
    return { error: "Длительность должна быть целым числом минут" };
  }
  if (durationMinutes < 5 || durationMinutes > 240) {
    return { error: "Длительность должна быть от 5 до 240 минут" };
  }
  return { input: { title, description, durationMinutes } };
}

// Паттерн email - из контракта (issue #12): имя@домен.зона без пробелов.
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface BookingBody {
  typeId: string;
  startsAt: string;
  guestName: string;
  guestEmail: string;
  comment?: string;
}

export type BookingValidation = { input: BookingBody } | { error: string };

/** Валидация брони по контракту: тип обязателен, старт - момент UTC,
 * имя гостя обязательное до 100 символов, email обязательный с паттерном,
 * комментарий опциональный до 500 символов.
 */
export function validateBookingBody(body: unknown): BookingValidation {
  if (typeof body !== "object" || body === null) {
    return {
      error:
        "Ожидается JSON-объект с полями typeId, startsAt, guestName и guestEmail",
    };
  }
  const record = body as Record<string, unknown>;
  const { typeId, startsAt, guestName, guestEmail, comment } = record;

  if (typeof typeId !== "string" || typeId.length === 0) {
    return { error: "Тип встречи обязателен" };
  }
  if (typeof startsAt !== "string" || Number.isNaN(Date.parse(startsAt))) {
    return { error: "Время начала должно быть моментом в формате ISO 8601" };
  }
  if (typeof guestName !== "string" || guestName.length === 0) {
    return { error: "Имя гостя обязательно" };
  }
  if (guestName.length > 100) {
    return { error: "Имя гостя не может быть длиннее 100 символов" };
  }
  if (typeof guestEmail !== "string" || !EMAIL_PATTERN.test(guestEmail)) {
    return { error: "Email гостя обязателен и должен быть корректным" };
  }
  if (comment !== undefined) {
    if (typeof comment !== "string") {
      return { error: "Комментарий должен быть строкой" };
    }
    if (comment.length > 500) {
      return { error: "Комментарий не может быть длиннее 500 символов" };
    }
  }

  return {
    input: {
      typeId,
      // Время нормализуется к UTC Z при записи в хранилище.
      startsAt: new Date(startsAt).toISOString(),
      guestName,
      guestEmail,
      ...(comment === undefined ? {} : { comment }),
    },
  };
}
