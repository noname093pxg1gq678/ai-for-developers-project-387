// Контракт API - источник истины (issue #1).
// Решения: UTC в ISO 8601, пояс владельца Europe/Moscow (ADR 0002);
// рабочее время пн-пт 09:00-18:00; шаг слотов 30 минут; окно записи
// 14 календарных дней от текущего дня; длительность 5-240 минут;
// ошибки 400/404/409; типы отдаются по времени создания, новые сверху.
import "@typespec/http";

using Http;

@service(#{
  title: "Календарь звонков",
})
@server("/", "API живёт на корне origin: в dev фронтенд проксирует /api, в контейнере то же origin")
namespace CallBooking;

/** Поля типа встречи, общие для чтения и записи. */
model MeetingTypeFields {
  /** Название, например «Звонок на 45 минут». */
  @maxLength(100)
  title: string;

  /** Описание для гостя. */
  @maxLength(500)
  description: string;

  /** Длительность в минутах. */
  @minValue(5)
  @maxValue(240)
  durationMinutes: int32;
}

/** Тип встречи, опубликованный владельцем. */
model MeetingType {
  /** Устойчивый идентификатор. */
  id: string;

  /** Момент создания, UTC. */
  createdAt: utcDateTime;

  ...MeetingTypeFields;
}

/** Данные типа встречи при создании и изменении. */
model MeetingTypeInput {
  ...MeetingTypeFields;
}

/** Поля гостя, общие для брони и чтения встречи. */
model GuestFields {
  /** Имя гостя. */
  @maxLength(100)
  guestName: string;

  /** Email гостя. */
  @pattern("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
  guestEmail: string;

  /** Тема разговора, короткая однострочная строка о предмете звонка. */
  @maxLength(100)
  topic: string;

  /** Комментарий гостя. */
  @maxLength(500)
  comment?: string;
}

/** Встреча - результат бронирования слота гостем. */
model Meeting {
  /** Устойчивый идентификатор. */
  id: string;

  /** Тип встречи. */
  typeId: string;

  /** Название типа встречи на момент чтения. */
  typeTitle: string;

  /** Старт слота, UTC. */
  startsAt: utcDateTime;

  ...GuestFields;
}

/** Данные бронирования слота гостем. */
model BookingInput {
  /** Тип встречи. */
  typeId: string;

  /** Старт свободного слота, UTC. */
  startsAt: utcDateTime;

  ...GuestFields;
}

/** Ошибка API. */
@error
model ApiError {
  message: string;
}

/** Ошибка валидации запроса. */
@error
model ValidationError {
  @statusCode
  statusCode: 400;

  message: string;
}

/** Тип встречи или слот не найдены. */
@error
model NotFoundError {
  @statusCode
  statusCode: 404;

  message: string;
}

/** Слот занят, тип встречи имеет будущие встречи или бронь пересекается с существующей встречей. */
@error
model ConflictError {
  @statusCode
  statusCode: 409;

  message: string;
}

/** Успешное создание типа встречи. */
model CreatedMeetingType {
  @statusCode
  statusCode: 201;

  ...MeetingType;
}

/** Успешное бронирование слота. */
model CreatedMeeting {
  @statusCode
  statusCode: 201;

  ...Meeting;
}

@route("/api/meeting-types")
interface MeetingTypes {
  /** Список типов встреч: по времени создания, новые сверху. */
  @get
  listTypes(): MeetingType[];

  /** Создать тип встречи. */
  @post
  createType(...MeetingTypeInput): CreatedMeetingType | ValidationError;

  /** Изменить тип встречи. */
  @put
  @route("{id}")
  updateType(
    @path id: string,
    ...MeetingTypeInput
  ): MeetingType | ValidationError | NotFoundError;

  /** Удалить тип встречи. С будущими встречами удаление запрещено. */
  @delete
  @route("{id}")
  deleteType(@path id: string): void | ConflictError | NotFoundError;

  /** Свободные старты слотов в окне записи, UTC: окно - 14 календарных
   * дней от текущего дня, прошедшие слоты исключены на момент запроса.
   */
  @get
  @route("{typeId}/slots")
  listSlots(@path typeId: string): utcDateTime[] | NotFoundError;
}

@route("/api/bookings")
interface Bookings {
  /** Забронировать свободный слот. */
  @post
  create(
    ...BookingInput
  ): CreatedMeeting | ValidationError | NotFoundError | ConflictError;
}

@route("/api/meetings")
interface Meetings {
  /** Предстоящие встречи владельца по всем типам. */
  @get
  list(): Meeting[];
}
