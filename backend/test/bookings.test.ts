import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { resetStore, seedMeeting } from "../src/store.js";

// Бронирование слота гостя через API (issue #12, шов 1 - HTTP inject).
// Фиксированное «сейчас» для детерминизма: понедельник 2026-11-16, 08:00
// по поясу владельца (Europe/Moscow, ADR 0002). Окно записи - 14 календарных
// дней от этого дня: пн 16 - пт 20, пн 23 - пт 27; выходные 21, 22, 28, 29.
const FIXED_NOW = new Date("2026-11-16T05:00:00Z");

describe("бронирование слота через API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetStore();
    app = await buildApp({ logger: false, now: FIXED_NOW });
  });

  async function createType(durationMinutes: number): Promise<string> {
    const created = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Звонок на 45 минут",
        description: "Созвон для обсуждения проекта",
        durationMinutes,
      },
    });
    return created.json().id;
  }

  it("успешная бронь отвечает 201 с данными встречи: id, тип, название типа, время, гость", async () => {
    const typeId = await createType(45);

    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсуждение проекта",
        comment: "Хочу обсудить проект",
      },
    });

    expect(response.statusCode).toBe(201);
    const meeting = response.json();
    expect(meeting.typeId).toBe(typeId);
    expect(meeting.typeTitle).toBe("Звонок на 45 минут");
    expect(meeting.startsAt).toBe("2026-11-16T06:00:00.000Z");
    expect(meeting.guestName).toBe("Мария Петрова");
    expect(meeting.guestEmail).toBe("maria@example.com");
    expect(meeting.topic).toBe("Обсуждение проекта");
    expect(meeting.comment).toBe("Хочу обсудить проект");
    expect(meeting.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("offset-дата нормализуется к UTC Z в ответе", async () => {
    const typeId = await createType(45);

    // 09:00 по поясу владельца = 06:00 UTC - валидный старт слота.
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T09:00:00+03:00",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().startsAt).toBe("2026-11-16T06:00:00.000Z");
  });

  it("бронь появляется в предстоящих встречах владельца", async () => {
    const typeId = await createType(45);
    await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсуждение проекта",
      },
    });

    const list = await app.inject({ method: "GET", url: "/api/meetings" });

    expect(list.statusCode).toBe(200);
    const meetings = list.json();
    expect(meetings).toHaveLength(1);
    expect(meetings[0].typeTitle).toBe("Звонок на 45 минут");
    expect(meetings[0].startsAt).toBe("2026-11-16T06:00:00.000Z");
    expect(meetings[0].guestName).toBe("Мария Петрова");
    expect(meetings[0].topic).toBe("Обсуждение проекта");
  });

  it("ошибки валидации отвечают 400 без создания встречи", async () => {
    const typeId = await createType(45);
    const invalidPayloads = [
      {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
      {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "и".repeat(101),
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
      {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария",
        guestEmail: "не-почта",
        topic: "Обсудить проект",
      },
      { typeId, startsAt: "2026-11-16T06:00:00Z", guestName: "Мария" },
      {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария",
        guestEmail: "maria@example.com",
      },
      {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария",
        guestEmail: "maria@example.com",
        topic: "",
      },
      {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария",
        guestEmail: "maria@example.com",
        topic: "т".repeat(101),
      },
      {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
        comment: "к".repeat(501),
      },
      {
        typeId,
        startsAt: "не-момент",
        guestName: "Мария",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
      {
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    ];

    for (const payload of invalidPayloads) {
      const response = await app.inject({
        method: "POST",
        url: "/api/bookings",
        payload,
      });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json().message).toEqual(expect.any(String));
    }

    const list = await app.inject({ method: "GET", url: "/api/meetings" });
    expect(list.json()).toEqual([]);
  });

  it("неизвестный тип встречи отвечает 404", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId: "unknown-id",
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toEqual(expect.any(String));
  });

  it("бронь на прошедшее время отвечает 400", async () => {
    const typeId = await createType(30);

    // 07:00 по поясу владельца - валидная позиция сетки, но уже прошло
    // относительно «сейчас» 08:00.
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T04:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toEqual(expect.any(String));

    const list = await app.inject({ method: "GET", url: "/api/meetings" });
    expect(list.json()).toEqual([]);
  });

  it("бронь на выходной отвечает 400", async () => {
    const typeId = await createType(30);

    // Суббота 21.11, 09:00 по поясу владельца.
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-21T06:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toEqual(expect.any(String));
  });

  it("бронь вне сетки 30 минут отвечает 400", async () => {
    const typeId = await createType(30);

    // 09:10 по поясу владельца - между стартами сетки.
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T06:10:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toEqual(expect.any(String));
  });

  it("бронь за окном записи отвечает 400", async () => {
    const typeId = await createType(30);

    // Понедельник 30.11 - за пределами окна 14 дней (16.11-29.11).
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-30T06:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toEqual(expect.any(String));
  });

  it("частичное наложение встреч разной длительности отвечает 409: 60 минут в 10:00, бронь 30 минут в 10:30", async () => {
    const typeId = await createType(30);
    const busyTypeId = await createType(60);
    // Существующая встреча 10:00-11:00 по поясу владельца.
    seedMeeting({
      id: crypto.randomUUID(),
      typeId: busyTypeId,
      startsAt: "2026-11-16T07:00:00Z",
      guestName: "Анна Кузнецова",
      guestEmail: "anna@example.com",
      topic: "Обсудить проект",
    });

    // Бронь на 30 минут с 10:30 целиком внутри существующей встречи.
    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T07:30:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toEqual(expect.any(String));
  });

  it("пересечение с существующей встречей отвечает 409 и слот исчезает из свободных", async () => {
    const typeId = await createType(30);
    const busyTypeId = await createType(45);
    // Существующая встреча 10:45-11:30 по поясу владельца.
    seedMeeting({
      id: crypto.randomUUID(),
      typeId: busyTypeId,
      startsAt: "2026-11-16T07:45:00Z",
      guestName: "Анна Кузнецова",
      guestEmail: "anna@example.com",
      topic: "Обсудить проект",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T08:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toEqual(expect.any(String));

    const slots = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${typeId}/slots`,
    });
    expect(slots.json<string[]>()).not.toContain("2026-11-16T08:00:00.000Z");
  });

  it("встреча вплотную к существующей разрешена: 201", async () => {
    const typeId = await createType(30);
    const busyTypeId = await createType(45);
    // Существующая встреча 10:45-11:30 по поясу владельца: бронь в 11:30
    // прилегает вплотную к её концу.
    seedMeeting({
      id: crypto.randomUUID(),
      typeId: busyTypeId,
      startsAt: "2026-11-16T07:45:00Z",
      guestName: "Анна Кузнецова",
      guestEmail: "anna@example.com",
      topic: "Обсудить проект",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/bookings",
      payload: {
        typeId,
        startsAt: "2026-11-16T08:30:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      },
    });

    expect(response.statusCode).toBe(201);
  });

  // Атомарность брони при конкурентных запросах (issue #5): проверка
  // пересечений и запись выполняются в одной синхронной транзакции
  // хранилища, однопоточный event loop делает её атомарной. inject-запросы
  // планируются тем же event loop, что и хранилище, поэтому гонка
  // детерминирована. Тесты - страж: падают, если между проверкой и записью
  // появится точка await.
  describe("конкурентные брони", () => {
    async function booking(
      app: FastifyInstance,
      payload: Record<string, unknown>,
    ) {
      return app.inject({
        method: "POST",
        url: "/api/bookings",
        payload,
      });
    }

    it("двадцать одинаковых POST на один слот: ровно один 201, остальные 409, встреча одна", async () => {
      const typeId = await createType(30);
      const payload = {
        typeId,
        startsAt: "2026-11-16T06:00:00Z",
        guestName: "Мария Петрова",
        guestEmail: "maria@example.com",
        topic: "Обсудить проект",
      };

      const responses = await Promise.all(
        Array.from({ length: 20 }, () => booking(app, payload)),
      );

      const created = responses.filter((r) => r.statusCode === 201);
      const conflicts = responses.filter((r) => r.statusCode === 409);
      expect(created).toHaveLength(1);
      expect(conflicts).toHaveLength(19);
      for (const response of conflicts) {
        expect(response.json().message).toEqual(expect.any(String));
      }

      const list = await app.inject({ method: "GET", url: "/api/meetings" });
      expect(list.json()).toHaveLength(1);
    });

    it("две одновременные брони на разные слоты: обе 201", async () => {
      const typeId = await createType(30);

      const responses = await Promise.all([
        booking(app, {
          typeId,
          startsAt: "2026-11-16T06:00:00Z",
          guestName: "Мария Петрова",
          guestEmail: "maria@example.com",
          topic: "Обсудить проект",
        }),
        booking(app, {
          typeId,
          startsAt: "2026-11-16T07:00:00Z",
          guestName: "Анна Кузнецова",
          guestEmail: "anna@example.com",
          topic: "Обсудить проект",
        }),
      ]);

      expect(responses.map((r) => r.statusCode)).toEqual([201, 201]);
    });

    it("одновременные брони разных типов на перекрывающееся время: один 201, пересечение 409", async () => {
      const firstTypeId = await createType(60);
      const secondTypeId = await createType(30);

      const responses = await Promise.all([
        booking(app, {
          typeId: firstTypeId,
          startsAt: "2026-11-16T06:00:00Z",
          guestName: "Мария Петрова",
          guestEmail: "maria@example.com",
          topic: "Обсудить проект",
        }),
        booking(app, {
          typeId: secondTypeId,
          startsAt: "2026-11-16T06:30:00Z",
          guestName: "Анна Кузнецова",
          guestEmail: "anna@example.com",
          topic: "Обсудить проект",
        }),
      ]);

      const created = responses.filter((r) => r.statusCode === 201);
      const conflicts = responses.filter((r) => r.statusCode === 409);
      expect(created).toHaveLength(1);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]?.json().message).toEqual(expect.any(String));
    });
  });
});
