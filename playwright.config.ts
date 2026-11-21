import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

// E2E против настоящего сервера (issue #13): собранное приложение одним
// процессом - бекенд раздаёт собранный фронтенд (STATIC_ROOT), как в
// контейнере. Никаких моков и подмены ответов API бронирования.
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.E2E_PORT ?? 4173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: path.join(rootDir, "e2e"),
  // Один воркер: стор в памяти процесса сервера, сценарий один на прогон.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL,
  },
  webServer: {
    command: "node backend/dist/index.js",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      HOST: "127.0.0.1",
      STATIC_ROOT: path.join(rootDir, "frontend", "dist"),
    },
  },
});
