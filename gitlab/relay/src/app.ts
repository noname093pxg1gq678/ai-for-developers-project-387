import Fastify, { type FastifyInstance } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { isBotActor, parseCommand } from "./guard.js";

/**
 * Переменные, с которыми релей запускает пайплайн агента (POST
 * /projects/:id/pipeline, ref=main). AGENT_* - вход guard-джобы
 * (gitlab/scripts/agent-guard.sh), ISSUE_* - уровень пайплайна:
 * resource_group и промпты. Участие в проекте уже проверено релеем
 * (AGENT_MEMBER_OK), guard-джоба перепроверяет команду и ботов.
 */
export interface PipelineVariables {
  AGENT_EVENT: "note" | "issue";
  AGENT_USERNAME: string;
  AGENT_BODY: string;
  AGENT_LABELS_COUNT: string;
  AGENT_MEMBER_OK: "true";
  AGENT_ISSUE_IID: string;
  AGENT_ISSUE_AUTHOR: string;
  ISSUE_IID: string;
  ISSUE_AUTHOR: string;
}

/**
 * Клиент GitLab API. В тестах подменяется инъекцией: сетевых вызовов нет.
 */
export interface GitlabClient {
  /**
   * Уровень доступа username к проекту (GitLab: GET
   * /projects/:id/members/all/:username с релейным токеном) или null,
   * если пользователь не участник.
   */
  memberAccessLevel(
    projectId: number,
    username: string,
  ): Promise<number | null>;
  /** Запуск пайплайна агента на ref=main. */
  triggerPipeline(
    projectId: number,
    variables: PipelineVariables,
  ): Promise<void>;
}

export interface AppOptions {
  logger?: boolean;
  /** Секрет вебхука: заголовок X-Gitlab-Token должен совпасть с ним. */
  webhookSecret: string;
  gitlab: GitlabClient;
}

/** Минимальная роль доверенного участника: Developer. */
const DEVELOPER_ACCESS_LEVEL = 30;

/** Постоянное сравнение секретов: hash + timingSafeEqual, без === по времени. */
function secretsEqual(expected: string, actual: string): boolean {
  const expectedHash = createHash("sha256").update(expected).digest("hex");
  const actualHash = createHash("sha256").update(actual).digest("hex");
  return timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash));
}

export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });

  app.get("/healthz", async () => ({ app: "gitlab-relay", status: "ok" }));

  app.post("/webhook", async (request, reply) => {
    const token = request.headers["x-gitlab-token"];
    if (
      typeof token !== "string" ||
      !secretsEqual(options.webhookSecret, token)
    ) {
      // Детали не выдаём наружу: только статус
      return reply.code(403).send({ message: "forbidden" });
    }

    let payload: Record<string, unknown>;
    try {
      payload = request.body as Record<string, unknown>;
    } catch {
      return reply.code(400).send({ message: "bad request" });
    }
    if (!payload || typeof payload !== "object") {
      return reply.code(400).send({ message: "bad request" });
    }

    const projectId = (payload.project as { id?: number } | undefined)?.id;
    const payloadUser =
      (payload.user as { username?: string; bot?: boolean } | undefined) ?? {};
    const username =
      typeof payloadUser.username === "string" ? payloadUser.username : "";
    const actor = { username, bot: payloadUser.bot === true };
    const event = payload.object_kind;

    if (event === "note") {
      // Комментарий в issue: команда от доверенного участника
      const issue = payload.issue as
        | { iid?: number; author?: { username?: string } }
        | undefined;
      const noteBody =
        (payload.object_attributes as { note?: unknown } | undefined)?.note ??
        "";
      if (typeof issue?.iid !== "number" || typeof noteBody !== "string") {
        return reply.code(204).send();
      }
      if (isBotActor(actor)) {
        return reply.code(403).send({ message: "forbidden" });
      }
      const accessLevel = await options.gitlab.memberAccessLevel(
        projectId!,
        username,
      );
      if (accessLevel === null || accessLevel < DEVELOPER_ACCESS_LEVEL) {
        return reply.code(403).send({ message: "forbidden" });
      }
      const command = parseCommand(noteBody);
      if (command === null) {
        return reply.code(204).send();
      }
      const issueAuthor =
        typeof issue.author?.username === "string" ? issue.author.username : "";
      await options.gitlab.triggerPipeline(projectId!, {
        AGENT_EVENT: "note",
        AGENT_USERNAME: username,
        AGENT_BODY: noteBody,
        AGENT_LABELS_COUNT: "0",
        AGENT_MEMBER_OK: "true",
        AGENT_ISSUE_IID: String(issue.iid),
        AGENT_ISSUE_AUTHOR: issueAuthor,
        ISSUE_IID: String(issue.iid),
        ISSUE_AUTHOR: issueAuthor,
      });
      return reply.code(202).send();
    }

    if (event === "issue") {
      // Новый тикет: автотриаж, если у обращения ещё нет меток
      const attributes = payload.object_attributes as
        | { iid?: number }
        | undefined;
      const labels = Array.isArray(payload.labels) ? payload.labels : [];
      if (typeof attributes?.iid !== "number") {
        return reply.code(204).send();
      }
      if (isBotActor(actor)) {
        return reply.code(403).send({ message: "forbidden" });
      }
      const accessLevel = await options.gitlab.memberAccessLevel(
        projectId!,
        username,
      );
      if (accessLevel === null || accessLevel < DEVELOPER_ACCESS_LEVEL) {
        return reply.code(403).send({ message: "forbidden" });
      }
      if (labels.length > 0) {
        // Размеченные issues пропускаются: готовые тикеты и разобранные не трогаются
        return reply.code(204).send();
      }
      await options.gitlab.triggerPipeline(projectId!, {
        AGENT_EVENT: "issue",
        AGENT_USERNAME: username,
        AGENT_BODY: "",
        AGENT_LABELS_COUNT: "0",
        AGENT_MEMBER_OK: "true",
        AGENT_ISSUE_IID: String(attributes.iid),
        AGENT_ISSUE_AUTHOR: username,
        ISSUE_IID: String(attributes.iid),
        ISSUE_AUTHOR: username,
      });
      return reply.code(202).send();
    }

    return reply.code(204).send();
  });

  return app;
}
