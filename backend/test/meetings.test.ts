import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { resetStore, seedMeeting } from "../src/store.js";

describe("предстоящие встречи через API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetStore();
    app = await buildApp({ logger: false });
  });

  it("без встреч отдаёт пустой список", async () => {
    const list = await app.inject({ method: "GET", url: "/api/meetings" });

    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([]);
  });

  it("отдаёт предстоящие встречи по возрастанию времени начала, прошедшие исключены", async () => {
    const firstType = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Звонок на 45 минут",
        description: "Созвон для обсуждения проекта",
        durationMinutes: 45,
      },
    });
    const secondType = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Вводный звонок",
        description: "Знакомство",
        durationMinutes: 20,
      },
    });
    seedMeeting({
      id: "later",
      typeId: firstType.json().id,
      startsAt: "2099-01-02T10:00:00Z",
      guestName: "Мария Петрова",
      guestEmail: "maria@example.com",
      comment: "Хочу обсудить проект",
    });
    seedMeeting({
      id: "past",
      typeId: firstType.json().id,
      startsAt: "2020-01-01T09:00:00Z",
      guestName: "Иван Смирнов",
      guestEmail: "ivan@example.com",
    });
    seedMeeting({
      id: "earlier",
      typeId: secondType.json().id,
      startsAt: "2099-01-01T09:00:00Z",
      guestName: "Анна Кузнецова",
      guestEmail: "anna@example.com",
    });

    const list = await app.inject({ method: "GET", url: "/api/meetings" });

    expect(list.statusCode).toBe(200);
    expect(list.json().map((meeting: { id: string }) => meeting.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("typeTitle отдаётся на момент чтения: после переименования типа список встреч показывает новое название", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Старое название",
        description: "Описание",
        durationMinutes: 30,
      },
    });
    const typeId = created.json().id;
    seedMeeting({
      id: "meeting-1",
      typeId,
      startsAt: "2099-01-01T10:00:00Z",
      guestName: "Иван Смирнов",
      guestEmail: "ivan@example.com",
    });

    await app.inject({
      method: "PUT",
      url: `/api/meeting-types/${typeId}`,
      payload: {
        title: "Новое название",
        description: "Описание",
        durationMinutes: 30,
      },
    });

    const list = await app.inject({ method: "GET", url: "/api/meetings" });

    expect(list.statusCode).toBe(200);
    expect(
      list.json().map((meeting: { typeTitle: string }) => meeting.typeTitle),
    ).toEqual(["Новое название"]);
  });

  it("время начала нормализуется к UTC (Z) при записи в хранилище", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Вводный звонок",
        description: "Знакомство",
        durationMinutes: 20,
      },
    });
    seedMeeting({
      id: "offset",
      typeId: created.json().id,
      // 2099-01-01T15:00:00Z, записано со смещением пояса UTC+14
      startsAt: "2099-01-02T05:00:00+14:00",
      guestName: "Иван Смирнов",
      guestEmail: "ivan@example.com",
    });

    const list = await app.inject({ method: "GET", url: "/api/meetings" });

    expect(list.json()[0].startsAt).toBe("2099-01-01T15:00:00.000Z");
  });
});
