import { describe, expect, it } from "vitest";
import { ApiError, toApiError } from "./apiError";

describe("общая ошибка API-адаптеров", () => {
  it("переносит сообщение из тела ответа и сохраняет статус", () => {
    const error = toApiError(409, { message: "Конфликт" }, "Запасной текст");

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe("Конфликт");
  });

  it("не-объектное тело и тело без строкового message дают запасной текст", () => {
    for (const body of [null, "ошибка", {}, { message: 42 }]) {
      const error = toApiError(0, body, "Запасной текст");
      expect(error.status).toBe(0);
      expect(error.message).toBe("Запасной текст");
    }
  });
});
