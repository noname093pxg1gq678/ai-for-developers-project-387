import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import {
  createMeetingType,
  deleteMeetingType,
  hasFutureMeetings,
  listFreeSlots,
  listMeetingTypes,
  listUpcomingMeetings,
  meetingTypeExists,
  meetingView,
  updateMeetingType,
  createBooking,
} from "./store.js";
import { validateBookingBody, validateMeetingTypeBody } from "./validation.js";

export interface AppOptions {
  logger?: boolean;
  /** Корень собранного фронтенда: раздаёт статику со SPA-fallback. */
  staticRoot?: string;
  /** Текущее время: инъекция для детерминизма тестов (issue #11). */
  now?: Date;
}

const health = () => ({ app: "call-booking-api", status: "ok" });

export async function buildApp(
  options: AppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/api/health", async () => health());

  app.post("/api/meeting-types", async (request, reply) => {
    const validation = validateMeetingTypeBody(request.body);
    if ("error" in validation) {
      return reply.code(400).send({ message: validation.error });
    }
    const record = createMeetingType(validation.input);
    return reply.code(201).send(record);
  });

  app.get("/api/meeting-types", async () => listMeetingTypes());

  // Свободные старты слотов в окне записи (контракт, issue #11).
  app.get("/api/meeting-types/:typeId/slots", async (request, reply) => {
    const { typeId } = request.params as { typeId: string };
    if (!meetingTypeExists(typeId)) {
      return reply.code(404).send({ message: "Тип встречи не найден" });
    }
    return listFreeSlots(typeId, options.now);
  });

  // Предстоящие встречи владельца по всем типам (контракт).
  app.get("/api/meetings", async () => listUpcomingMeetings(options.now));

  // Бронирование свободного слота (контракт, issue #12): только валидная
  // позиция свободного слота, пересечение - 409.
  app.post("/api/bookings", async (request, reply) => {
    const validation = validateBookingBody(request.body);
    if ("error" in validation) {
      return reply.code(400).send({ message: validation.error });
    }
    const outcome = createBooking(validation.input, options.now);
    if (outcome.status === "unknownType") {
      return reply.code(404).send({ message: "Тип встречи не найден" });
    }
    if (outcome.status === "notFreeSlot") {
      return reply.code(400).send({ message: "Не свободный слот" });
    }
    if (outcome.status === "conflict") {
      return reply.code(409).send({ message: "Слот уже занят" });
    }
    return reply.code(201).send(meetingView(outcome.record));
  });

  app.put("/api/meeting-types/:id", async (request, reply) => {
    const validation = validateMeetingTypeBody(request.body);
    if ("error" in validation) {
      return reply.code(400).send({ message: validation.error });
    }
    const { id } = request.params as { id: string };
    const record = updateMeetingType(id, validation.input);
    if (!record) {
      return reply.code(404).send({ message: "Тип встречи не найден" });
    }
    return record;
  });

  app.delete("/api/meeting-types/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!meetingTypeExists(id)) {
      return reply.code(404).send({ message: "Тип встречи не найден" });
    }
    if (hasFutureMeetings(id, options.now)) {
      return reply.code(409).send({
        message: "Нельзя удалить тип встречи с предстоящими встречами",
      });
    }
    deleteMeetingType(id);
    return reply.code(204).send();
  });

  if (options.staticRoot) {
    await app.register(fastifyStatic, { root: options.staticRoot });
    // SPA-fallback: неизвестные пути отдают index.html - клиентский роутер
    // сам разрулит /admin и /book/*; API отвечает обычным 404 JSON-ом.
    app.setNotFoundHandler((request, reply) => {
      const pathname = request.url.split("?")[0] ?? request.url;
      const isApi = pathname === "/api" || pathname.startsWith("/api/");
      if (request.method === "GET" && !isApi) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ message: "Not found" });
    });
  } else {
    app.get("/", async () => health());
  }

  return app;
}
