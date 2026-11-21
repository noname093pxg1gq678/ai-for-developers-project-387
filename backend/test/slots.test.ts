import type { FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { resetStore, seedMeeting } from "../src/store.js";

// Фиксированное «сейчас» для детерминизма: понедельник 2026-11-16, 08:00
// по поясу владельца (Europe/Moscow, ADR 0002). Окно записи - 14 календарных
// дней от этого дня: пн 16 - пт 20, пн 23 - пт 27; выходные 21, 22, 28, 29.
const FIXED_NOW = new Date("2026-11-16T05:00:00Z");

describe("свободные слоты через API", () => {
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
        title: "Звонок",
        description: "Описание",
        durationMinutes,
      },
    });
    return created.json().id;
  }

  it("для неизвестного типа отвечает 404", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/meeting-types/unknown-id/slots",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toEqual(expect.any(String));
  });

  it("окно - 14 календарных дней от текущего дня, рабочие дни пн-пт", async () => {
    const typeId = await createType(30);

    const response = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${typeId}/slots`,
    });

    expect(response.statusCode).toBe(200);
    const dates = new Set(
      response.json<string[]>().map((start) => start.slice(0, 10)),
    );
    expect([...dates].sort()).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
    ]);
  });

  it("старты шагом 30 минут в рабочих часах 09:00-18:00 пояса владельца", async () => {
    const typeId = await createType(30);

    const response = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${typeId}/slots`,
    });

    // Полный понедельник: 09:00-17:30 по Europe/Moscow = 06:00-14:30 UTC.
    const monday = response
      .json<string[]>()
      .filter((start) => start.startsWith("2026-11-16"));
    expect(monday).toEqual([
      "2026-11-16T06:00:00.000Z",
      "2026-11-16T06:30:00.000Z",
      "2026-11-16T07:00:00.000Z",
      "2026-11-16T07:30:00.000Z",
      "2026-11-16T08:00:00.000Z",
      "2026-11-16T08:30:00.000Z",
      "2026-11-16T09:00:00.000Z",
      "2026-11-16T09:30:00.000Z",
      "2026-11-16T10:00:00.000Z",
      "2026-11-16T10:30:00.000Z",
      "2026-11-16T11:00:00.000Z",
      "2026-11-16T11:30:00.000Z",
      "2026-11-16T12:00:00.000Z",
      "2026-11-16T12:30:00.000Z",
      "2026-11-16T13:00:00.000Z",
      "2026-11-16T13:30:00.000Z",
      "2026-11-16T14:00:00.000Z",
      "2026-11-16T14:30:00.000Z",
    ]);
  });

  it("прошедшие слоты исключены на момент запроса", async () => {
    const typeId = await createType(30);
    // 12:10 по поясу владельца: старт 12:00 уже прошёл, сетка идёт с 12:30.
    const midDayApp = await buildApp({
      logger: false,
      now: new Date("2026-11-16T09:10:00Z"),
    });

    const response = await midDayApp.inject({
      method: "GET",
      url: `/api/meeting-types/${typeId}/slots`,
    });

    const monday = response
      .json<string[]>()
      .filter((start) => start.startsWith("2026-11-16"));
    expect(monday[0]).toBe("2026-11-16T09:30:00.000Z");
    expect(monday[monday.length - 1]).toBe("2026-11-16T14:30:00.000Z");
    expect(monday).toHaveLength(11);
  });

  it("пересечения со встречами исключены, встречи вплотную разрешены", async () => {
    const typeId = await createType(30);
    const busyTypeId = await createType(45);
    // Встреча 11:00-11:45 по поясу владельца: 45 минут, а не длительность
    // запрашиваемого типа - перекрывает старты 11:00 и 11:30, но не 10:30.
    seedMeeting({
      id: crypto.randomUUID(),
      typeId: busyTypeId,
      startsAt: "2026-11-16T08:00:00Z",
      guestName: "Гость",
      guestEmail: "guest@example.com",
      topic: "Обсудить проект",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${typeId}/slots`,
    });

    const monday = response
      .json<string[]>()
      .filter((start) => start.startsWith("2026-11-16"));
    expect(monday).not.toContain("2026-11-16T08:00:00.000Z");
    expect(monday).not.toContain("2026-11-16T08:30:00.000Z");
    expect(monday).toContain("2026-11-16T07:30:00.000Z");
    expect(monday).toContain("2026-11-16T09:00:00.000Z");
  });

  it("старт длительностью типа умещается в рабочие часы", async () => {
    const typeId = await createType(60);

    const response = await app.inject({
      method: "GET",
      url: `/api/meeting-types/${typeId}/slots`,
    });

    // 60 минут: последний старт 17:00 по поясу владельца = 14:00 UTC.
    const monday = response
      .json<string[]>()
      .filter((start) => start.startsWith("2026-11-16"));
    expect(monday[monday.length - 1]).toBe("2026-11-16T14:00:00.000Z");
    expect(monday).toHaveLength(17);
  });
});
