import Fastify, { type FastifyInstance } from "fastify";
import { createHash, timingSafeEqual } from "node:crypto";
import { isBotActor, parseCommand } from "./guard.js";

/**
 * Переменные, с которыми релей запускает пайплайн агента (POST
 * /projects/:id/pipeline, ref=main). AGENT_* - вход guard-джобы
 * (gitlab/scripts/agent-guard.sh); ISSUE_* и MR_* - уровень пайплайна:
 * resource_group и промпты. Участие в проекте уже проверено релеем
 * (AGENT_MEMBER_OK), guard-джоба перепроверяет команду и ботов.
 *
 * События:
 * - note        - команда в комментарии к issue
 * - issue       - новый тикет (автотриаж)
 * - merge_request - событие MR для авторевью (open/reopen/update)
 * - mr_note     - команда в комментарии к MR (правки в head-ветку MR)
 */
export interface PipelineVariables {
  AGENT_EVENT: "note" | "issue" | "merge_request" | "mr_note";
  AGENT_USERNAME: string;
  AGENT_BODY: string;
  AGENT_LABELS_COUNT: string;
  AGENT_MEMBER_OK: "true";
  AGENT_ISSUE_IID: string;
  AGENT_ISSUE_AUTHOR: string;
  ISSUE_IID: string;
  ISSUE_AUTHOR: string;
  /** MR-режим: iid, ветки и заголовок MR (пусто для issue-событий). */
  MR_IID: string;
  MR_SOURCE_BRANCH: string;
  MR_TARGET_BRANCH: string;
  MR_TITLE: string;
}

/**
 * Бюджет командных комментариев на MR (аналог .github/scripts/agent-budget.sh):
 * релей считает доверенные командные комментарии MR и не запускает агента
 * сверх лимита.
 */
export const MR_COMMAND_BUDGET = 3;

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
  /**
   * Комментарии MR: id, тело и username автора - релей считает по ним
   * бюджет команд (bots отфильтрованы на этом уровне).
   */
  mrNotes(
    projectId: number,
    mrIid: number,
  ): Promise<Array<{ id: number; body: string; username: string }>>;
  /** Комментарий к MR от имени релея (причина отказа: бюджет). */
  postMrNote(projectId: number, mrIid: number, body: string): Promise<void>;
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
        MR_IID: "",
        MR_SOURCE_BRANCH: "",
        MR_TARGET_BRANCH: "",
        MR_TITLE: "",
      });
      return reply.code(202).send();
    }

    if (event === "merge_request") {
      // Авторевью: MR создан, переоткрыт или обновлён доверенным участником.
      // Черновики и MR из форков не доверенные (аналог fork-фильтра GitHub).
      const mr = payload.object_attributes as
        | {
            iid?: number;
            action?: string;
            title?: string;
            source_branch?: string;
            target_branch?: string;
            source_project_id?: number;
            draft?: boolean;
            work_in_progress?: boolean;
          }
        | undefined;
      if (
        typeof mr?.iid !== "number" ||
        typeof mr.source_branch !== "string" ||
        typeof mr.target_branch !== "string"
      ) {
        return reply.code(204).send();
      }
      if (mr.source_project_id !== projectId) {
        // Ветки из других проектов (форков) не ревьюятся: контент недоверенный
        return reply.code(204).send();
      }
      if (!["open", "reopen", "update"].includes(mr.action ?? "")) {
        // close/merge/approve и прочее - не событие для ревью
        return reply.code(204).send();
      }
      const title = typeof mr.title === "string" ? mr.title : "";
      if (
        mr.draft === true ||
        mr.work_in_progress === true ||
        /^draft[:\s]/i.test(title) ||
        /^wip[:\s]/i.test(title)
      ) {
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
      await options.gitlab.triggerPipeline(projectId!, {
        AGENT_EVENT: "merge_request",
        AGENT_USERNAME: username,
        AGENT_BODY: "",
        AGENT_LABELS_COUNT: "0",
        AGENT_MEMBER_OK: "true",
        AGENT_ISSUE_IID: "",
        AGENT_ISSUE_AUTHOR: "",
        ISSUE_IID: String(mr.iid),
        ISSUE_AUTHOR: username,
        MR_IID: String(mr.iid),
        MR_SOURCE_BRANCH: mr.source_branch,
        MR_TARGET_BRANCH: mr.target_branch,
        MR_TITLE: title,
      });
      return reply.code(202).send();
    }

    if (event === "note") {
      const mr = payload.merge_request as
        | {
            iid?: number;
            source_branch?: string;
            target_branch?: string;
            title?: string;
          }
        | undefined;
      if (mr && typeof mr.iid === "number") {
        // Команда в комментарии к MR: правки агента идут в head-ветку MR.
        // Бюджет командных комментариев считает релей - guard-джоба токенов
        // GitLab API не имеет (CI_JOB_TOKEN read-only).
        const noteId = (
          payload.object_attributes as { id?: number } | undefined
        )?.id;
        const noteBody =
          (payload.object_attributes as { note?: unknown } | undefined)?.note ??
          "";
        if (typeof noteBody !== "string") {
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
        const notes = await options.gitlab.mrNotes(projectId!, mr.iid);
        const budgetUsed = notes.filter(
          (n) =>
            n.id !== noteId &&
            !/bot/i.test(n.username) &&
            parseCommand(n.body) !== null,
        ).length;
        if (budgetUsed >= MR_COMMAND_BUDGET) {
          await options.gitlab.postMrNote(
            projectId!,
            mr.iid,
            "Бюджет командных комментариев исчерпан (3 на MR): правки агента по этой команде не запускаются. Откройте новый MR или продолжите в issue.",
          );
          return reply.code(202).send({ message: "budget_exhausted" });
        }
        if (
          typeof mr.source_branch !== "string" ||
          typeof mr.target_branch !== "string"
        ) {
          return reply.code(204).send();
        }
        const mrTitle = typeof mr.title === "string" ? mr.title : "";
        await options.gitlab.triggerPipeline(projectId!, {
          AGENT_EVENT: "mr_note",
          AGENT_USERNAME: username,
          AGENT_BODY: noteBody,
          AGENT_LABELS_COUNT: "0",
          AGENT_MEMBER_OK: "true",
          AGENT_ISSUE_IID: "",
          AGENT_ISSUE_AUTHOR: "",
          ISSUE_IID: String(mr.iid),
          ISSUE_AUTHOR: username,
          MR_IID: String(mr.iid),
          MR_SOURCE_BRANCH: mr.source_branch,
          MR_TARGET_BRANCH: mr.target_branch,
          MR_TITLE: mrTitle,
        });
        return reply.code(202).send();
      }
      // Комментарий к issue: команда от доверенного участника
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
        MR_IID: "",
        MR_SOURCE_BRANCH: "",
        MR_TARGET_BRANCH: "",
        MR_TITLE: "",
      });
      return reply.code(202).send();
    }

    return reply.code(204).send();
  });

  return app;
}
