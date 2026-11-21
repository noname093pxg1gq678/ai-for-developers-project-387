import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { resetStore, seedMeeting } from "../src/store.js";

describe("CRUD типов встреч через API", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    resetStore();
    app = await buildApp({ logger: false });
  });

  it("выдаёт типы по времени создания, новые сверху", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Первый тип",
        description: "Создан раньше",
        durationMinutes: 20,
      },
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Второй тип",
        description: "Создан позже",
        durationMinutes: 45,
      },
    });

    const list = await app.inject({ method: "GET", url: "/api/meeting-types" });

    expect(list.json()).toEqual([second.json(), first.json()]);
  });

  it("изменение и удаление неизвестного id отвечают 404", async () => {
    const updated = await app.inject({
      method: "PUT",
      url: "/api/meeting-types/unknown-id",
      payload: {
        title: "Заголовок",
        description: "Описание",
        durationMinutes: 30,
      },
    });
    const removed = await app.inject({
      method: "DELETE",
      url: "/api/meeting-types/unknown-id",
    });

    expect(updated.statusCode).toBe(404);
    expect(updated.json().message).toEqual(expect.any(String));
    expect(removed.statusCode).toBe(404);
    expect(removed.json().message).toEqual(expect.any(String));
  });

  it("нарушение валидации отвечает 400 с сообщением", async () => {
    const cases = [
      {
        name: "пустой title",
        payload: { title: "", description: "Описание", durationMinutes: 30 },
      },
      {
        name: "title длиннее 100",
        payload: {
          title: "А".repeat(101),
          description: "Описание",
          durationMinutes: 30,
        },
      },
      {
        name: "пустой description",
        payload: { title: "Заголовок", description: "", durationMinutes: 30 },
      },
      {
        name: "description длиннее 500",
        payload: {
          title: "Заголовок",
          description: "Б".repeat(501),
          durationMinutes: 30,
        },
      },
      {
        name: "durationMinutes меньше 5",
        payload: {
          title: "Заголовок",
          description: "Описание",
          durationMinutes: 4,
        },
      },
      {
        name: "durationMinutes больше 240",
        payload: {
          title: "Заголовок",
          description: "Описание",
          durationMinutes: 241,
        },
      },
      {
        name: "durationMinutes не целое",
        payload: {
          title: "Заголовок",
          description: "Описание",
          durationMinutes: 30.5,
        },
      },
      {
        name: "нет title",
        payload: { description: "Описание", durationMinutes: 30 },
      },
      {
        name: "нет durationMinutes",
        payload: { title: "Заголовок", description: "Описание" },
      },
    ];

    for (const { name, payload } of cases) {
      const created = await app.inject({
        method: "POST",
        url: "/api/meeting-types",
        payload,
      });
      expect(created.statusCode, name).toBe(400);
      expect(created.json().message, name).toEqual(expect.any(String));
    }
  });

  it("удаление типа с будущей встречей отвечает 409, с прошедшей - удаляется", async () => {
    const withFuture = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Тип с будущей встречей",
        description: "Нельзя удалить",
        durationMinutes: 30,
      },
    });
    const withPast = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Тип с прошедшей встречей",
        description: "Можно удалить",
        durationMinutes: 45,
      },
    });
    seedMeeting({
      id: crypto.randomUUID(),
      typeId: withFuture.json().id,
      startsAt: "2099-01-01T09:00:00Z",
      guestName: "Гость",
      guestEmail: "guest@example.com",
    });
    seedMeeting({
      id: crypto.randomUUID(),
      typeId: withPast.json().id,
      startsAt: "2020-01-01T09:00:00Z",
      guestName: "Гость",
      guestEmail: "guest@example.com",
    });

    const forbidden = await app.inject({
      method: "DELETE",
      url: `/api/meeting-types/${withFuture.json().id}`,
    });
    expect(forbidden.statusCode).toBe(409);
    expect(forbidden.json().message).toEqual(expect.any(String));

    const listAfterForbidden = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });
    expect(listAfterForbidden.json().map((t: { id: string }) => t.id)).toEqual([
      withPast.json().id,
      withFuture.json().id,
    ]);

    const allowed = await app.inject({
      method: "DELETE",
      url: `/api/meeting-types/${withPast.json().id}`,
    });
    expect(allowed.statusCode).toBe(204);

    const listAfterAllowed = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });
    expect(listAfterAllowed.json().map((t: { id: string }) => t.id)).toEqual([
      withFuture.json().id,
    ]);
  });

  it("жизненный цикл типа: создание, появление в списке, изменение, удаление", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Звонок на 45 минут",
        description: "Созвон для обсуждения проекта",
        durationMinutes: 45,
      },
    });

    expect(created.statusCode).toBe(201);
    const createdType = created.json();
    expect(createdType).toMatchObject({
      title: "Звонок на 45 минут",
      description: "Созвон для обсуждения проекта",
      durationMinutes: 45,
    });
    expect(createdType.id).toEqual(expect.any(String));
    expect(createdType.createdAt).toEqual(expect.any(String));

    const list = await app.inject({ method: "GET", url: "/api/meeting-types" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual([createdType]);

    const updated = await app.inject({
      method: "PUT",
      url: `/api/meeting-types/${createdType.id}`,
      payload: {
        title: "Изменённый звонок",
        description: "Другое описание",
        durationMinutes: 30,
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: createdType.id,
      title: "Изменённый звонок",
      durationMinutes: 30,
    });

    const listAfterUpdate = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });
    expect(listAfterUpdate.json()).toEqual([updated.json()]);

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/meeting-types/${createdType.id}`,
    });

    expect(removed.statusCode).toBe(204);

    const listAfterDelete = await app.inject({
      method: "GET",
      url: "/api/meeting-types",
    });
    expect(listAfterDelete.json()).toEqual([]);
  });

  it("прошедшая встреча со смещением пояса не мешает удалению типа", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: {
        title: "Тип с прошедшей встречей",
        description: "Можно удалить",
        durationMinutes: 45,
      },
    });
    // Час назад, записано в поясе UTC+14: момент уже прошёл,
    // а ISO-строка лексикографически выглядит будущей.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const shifted = new Date(hourAgo.getTime() + 14 * 60 * 60 * 1000);
    seedMeeting({
      id: crypto.randomUUID(),
      typeId: created.json().id,
      startsAt: `${shifted.toISOString().slice(0, 19)}+14:00`,
      guestName: "Гость",
      guestEmail: "guest@example.com",
    });

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/meeting-types/${created.json().id}`,
    });

    expect(removed.statusCode).toBe(204);
  });
});
