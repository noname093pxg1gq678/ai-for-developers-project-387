import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const staticRoot = path.join(import.meta.dirname, "fixtures", "static");

describe("API без статики", () => {
  it("отвечает на GET / через inject", async () => {
    const app = await buildApp({ logger: false });

    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ app: "call-booking-api", status: "ok" });
    await app.close();
  });

  it("поднимает сервер и отвечает по HTTP", async () => {
    const app = await buildApp({ logger: false });
    const address = await app.listen({ port: 0, host: "127.0.0.1" });

    const res = await fetch(address);
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    await app.close();
  });

  it("здоровье API доступно на /api/health", async () => {
    const app = await buildApp({ logger: false });

    const res = await app.inject({ method: "GET", url: "/api/health" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ app: "call-booking-api", status: "ok" });
    await app.close();
  });
});

describe("раздача статики фронтенда", () => {
  it("отдаёт index.html на /", async () => {
    const app = await buildApp({ logger: false, staticRoot });

    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Тестовая страница фронтенда");
    await app.close();
  });

  it("неизвестный путь получает SPA-fallback с index.html", async () => {
    const app = await buildApp({ logger: false, staticRoot });

    const res = await app.inject({ method: "GET", url: "/book/call-45" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Тестовая страница фронтенда");
    await app.close();
  });

  it("неизвестный API-путь отвечает 404 JSON-ом, без fallback", async () => {
    const app = await buildApp({ logger: false, staticRoot });

    const res = await app.inject({ method: "GET", url: "/api/unknown" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ message: "Not found" });
    await app.close();
  });

  it("путь, похожий на /api, но вне префикса, получает SPA-fallback", async () => {
    const app = await buildApp({ logger: false, staticRoot });

    const res = await app.inject({ method: "GET", url: "/apifoo" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Тестовая страница фронтенда");
    await app.close();
  });
});
