import { buildApp } from "./app.js";
import { HttpGitlabClient } from "./gitlab.js";

/**
 * Точка входа релея. Конфигурация - из окружения:
 *   WEBHOOK_SECRET - секрет вебхука self-hosted GitLab (обязательно)
 *   GITLAB_URL     - адрес инстанса, например https://gitlab.example.com (обязательно)
 *   GITLAB_TOKEN   - project access token релея, scope api (обязательно)
 *   PORT           - порт слушателя (по умолчанию 8080)
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT ?? 8080);
const app = buildApp({
  logger: true,
  webhookSecret: requireEnv("WEBHOOK_SECRET"),
  gitlab: new HttpGitlabClient(
    requireEnv("GITLAB_URL"),
    requireEnv("GITLAB_TOKEN"),
  ),
});

await app.listen({ port, host: "0.0.0.0" });
