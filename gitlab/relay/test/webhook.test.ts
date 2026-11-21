import { describe, expect, it } from "vitest";
import {
  buildApp,
  type GitlabClient,
  type PipelineVariables,
} from "../src/app.js";

const SECRET = "webhook-secret";

// Инъекция вместо настоящего GitLab API: сетевые вызовы в тестах не делаются
function makeFakeClient(accessLevel: number | null = 30): {
  client: GitlabClient;
  triggers: Array<{ projectId: number; variables: PipelineVariables }>;
} {
  const triggers: Array<{ projectId: number; variables: PipelineVariables }> =
    [];
  return {
    triggers,
    client: {
      async memberAccessLevel() {
        return accessLevel;
      },
      async triggerPipeline(projectId, variables) {
        triggers.push({ projectId, variables });
      },
      async mrNotes() {
        return [];
      },
      async postMrNote() {},
    },
  };
}

function notePayload(overrides: Record<string, unknown> = {}) {
  return {
    object_kind: "note",
    project: { id: 7 },
    user: { username: "alice" },
    issue: { iid: 42, author: { username: "reporter" } },
    object_attributes: { note: "@agent почини тесты" },
    ...overrides,
  };
}

function post(
  app: Awaited<ReturnType<typeof buildApp>>,
  payload: object,
  token = SECRET,
) {
  return app.inject({
    method: "POST",
    url: "/webhook",
    headers: { "x-gitlab-token": token, "content-type": "application/json" },
    payload,
  });
}

describe("POST /webhook: проверка секрета", () => {
  it("без заголовка X-Gitlab-Token - 403, пайплайн не запускается", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { "content-type": "application/json" },
      payload: notePayload(),
    });

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("с неверным секретом - 403, пайплайн не запускается", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, notePayload(), "wrong-secret");

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });
});

describe("POST /webhook: событие note", () => {
  it("команда от участника Developer+ - 202 и запуск пайплайна с переменными", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, notePayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toEqual([
      {
        projectId: 7,
        variables: {
          AGENT_EVENT: "note",
          AGENT_USERNAME: "alice",
          AGENT_BODY: "@agent почини тесты",
          AGENT_LABELS_COUNT: "0",
          AGENT_MEMBER_OK: "true",
          AGENT_ISSUE_IID: "42",
          AGENT_ISSUE_AUTHOR: "reporter",
          ISSUE_IID: "42",
          ISSUE_AUTHOR: "reporter",
          MR_IID: "",
          MR_SOURCE_BRANCH: "",
          MR_TARGET_BRANCH: "",
          MR_TITLE: "",
        },
      },
    ]);
    await app.close();
  });

  it("не команда - 204, пайплайн не запускается", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      notePayload({ object_attributes: { note: "просто комментарий" } }),
    );

    expect(res.statusCode).toBe(204);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("бот не доверенный - 403", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      notePayload({ user: { username: "project_12_bot_5f4a2b" } }),
    );

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("не участник проекта (API отдал 404) - 403", async () => {
    const fake = makeFakeClient(null);
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, notePayload());

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("роль ниже Developer - 403", async () => {
    const fake = makeFakeClient(20);
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, notePayload());

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });
});

describe("POST /webhook: событие issue (автотриаж)", () => {
  function issuePayload(overrides: Record<string, unknown> = {}) {
    return {
      object_kind: "issue",
      project: { id: 7 },
      user: { username: "reporter" },
      object_attributes: { iid: 43 },
      labels: [],
      ...overrides,
    };
  }

  it("issue без меток - 202 и запуск пайплайна на triage", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, issuePayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toEqual([
      {
        projectId: 7,
        variables: {
          AGENT_EVENT: "issue",
          AGENT_USERNAME: "reporter",
          AGENT_BODY: "",
          AGENT_LABELS_COUNT: "0",
          AGENT_MEMBER_OK: "true",
          AGENT_ISSUE_IID: "43",
          AGENT_ISSUE_AUTHOR: "reporter",
          ISSUE_IID: "43",
          ISSUE_AUTHOR: "reporter",
          MR_IID: "",
          MR_SOURCE_BRANCH: "",
          MR_TARGET_BRANCH: "",
          MR_TITLE: "",
        },
      },
    ]);
    await app.close();
  });

  it("issue с метками - 204, пайплайн не запускается", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      issuePayload({
        labels: [{ title: "ready-for-agent" }],
        object_attributes: { iid: 43 },
      }),
    );

    expect(res.statusCode).toBe(204);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });
});

describe("POST /webhook: событие merge_request (авторевью)", () => {
  function mrPayload(overrides: Record<string, unknown> = {}) {
    return {
      object_kind: "merge_request",
      project: { id: 7 },
      user: { username: "alice" },
      object_attributes: {
        iid: 12,
        action: "open",
        title: "Фича: фильтр календаря",
        source_branch: "feature/calendar-filter",
        target_branch: "main",
        source_project_id: 7,
      },
      ...overrides,
    };
  }

  it("open от участника Developer+ - 202 и запуск пайплайна ревью с контекстом MR", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrPayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toEqual([
      {
        projectId: 7,
        variables: {
          AGENT_EVENT: "merge_request",
          AGENT_USERNAME: "alice",
          AGENT_BODY: "",
          AGENT_LABELS_COUNT: "0",
          AGENT_MEMBER_OK: "true",
          AGENT_ISSUE_IID: "",
          AGENT_ISSUE_AUTHOR: "",
          ISSUE_IID: "12",
          ISSUE_AUTHOR: "alice",
          MR_IID: "12",
          MR_SOURCE_BRANCH: "feature/calendar-filter",
          MR_TARGET_BRANCH: "main",
          MR_TITLE: "Фича: фильтр календаря",
        },
      },
    ]);
    await app.close();
  });

  for (const action of ["reopen", "update"]) {
    it(`action=${action} - ревью запускается повторно`, async () => {
      const fake = makeFakeClient();
      const app = await buildApp({
        logger: false,
        webhookSecret: SECRET,
        gitlab: fake.client,
      });

      const res = await post(
        app,
        mrPayload({
          object_attributes: {
            iid: 12,
            action,
            title: "Фича: фильтр календаря",
            source_branch: "feature/calendar-filter",
            target_branch: "main",
            source_project_id: 7,
          },
        }),
      );

      expect(res.statusCode).toBe(202);
      expect(fake.triggers).toHaveLength(1);
      await app.close();
    });
  }

  for (const action of ["close", "merge", "approved"]) {
    it(`action=${action} - 204, ревью не запускается`, async () => {
      const fake = makeFakeClient();
      const app = await buildApp({
        logger: false,
        webhookSecret: SECRET,
        gitlab: fake.client,
      });

      const res = await post(
        app,
        mrPayload({ object_attributes: { iid: 12, action } }),
      );

      expect(res.statusCode).toBe(204);
      expect(fake.triggers).toHaveLength(0);
      await app.close();
    });
  }

  it("MR из форка (source_project_id != project.id) - 204: контент форка недоверенный", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      mrPayload({
        object_attributes: {
          iid: 12,
          action: "open",
          source_branch: "feature/x",
          target_branch: "main",
          source_project_id: 99,
        },
      }),
    );

    expect(res.statusCode).toBe(204);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("черновик (draft: true) - 204", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      mrPayload({
        object_attributes: {
          iid: 12,
          action: "open",
          draft: true,
          source_branch: "feature/x",
          target_branch: "main",
          source_project_id: 7,
        },
      }),
    );

    expect(res.statusCode).toBe(204);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("черновик по префиксу заголовка - 204", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      mrPayload({
        object_attributes: {
          iid: 12,
          action: "open",
          title: "Draft: черновик фичи",
          source_branch: "feature/x",
          target_branch: "main",
          source_project_id: 7,
        },
      }),
    );

    expect(res.statusCode).toBe(204);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("бот - 403", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrPayload({ user: { username: "relay-bot" } }));

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("не участник - 403", async () => {
    const fake = makeFakeClient(null);
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrPayload());

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });
});

describe("POST /webhook: команда в комментарии к MR (mr_note)", () => {
  function mrNotePayload(overrides: Record<string, unknown> = {}) {
    return {
      object_kind: "note",
      project: { id: 7 },
      user: { username: "alice" },
      object_attributes: { id: 500, note: "@agent поправь контраст" },
      merge_request: {
        iid: 12,
        title: "Фича: фильтр календаря",
        source_branch: "feature/calendar-filter",
        target_branch: "main",
      },
      ...overrides,
    };
  }

  it("команда от участника - 202 и запуск пайплайна с контекстом MR", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrNotePayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toEqual([
      {
        projectId: 7,
        variables: {
          AGENT_EVENT: "mr_note",
          AGENT_USERNAME: "alice",
          AGENT_BODY: "@agent поправь контраст",
          AGENT_LABELS_COUNT: "0",
          AGENT_MEMBER_OK: "true",
          AGENT_ISSUE_IID: "",
          AGENT_ISSUE_AUTHOR: "",
          ISSUE_IID: "12",
          ISSUE_AUTHOR: "alice",
          MR_IID: "12",
          MR_SOURCE_BRANCH: "feature/calendar-filter",
          MR_TARGET_BRANCH: "main",
          MR_TITLE: "Фича: фильтр календаря",
        },
      },
    ]);
    await app.close();
  });

  it("не команда - 204", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      mrNotePayload({ object_attributes: { id: 500, note: "спасибо" } }),
    );

    expect(res.statusCode).toBe(204);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("бюджет исчерпан: 3 предыдущие команды - пайплайн не запускается, публикуется отказ", async () => {
    const notes: Array<{ id: number; body: string; username: string }> = [];
    let nextId = 400;
    for (let i = 0; i < 3; i++) {
      notes.push({
        id: nextId++,
        body: "@agent работа раз",
        username: "alice",
      });
    }
    let rejectNote: string | null = null;
    const fake = {
      triggers: [] as unknown[],
      client: {
        async memberAccessLevel() {
          return 30;
        },
        async triggerPipeline() {
          throw new Error("не должен вызываться");
        },
        async mrNotes() {
          return notes;
        },
        async postMrNote(_projectId: number, _iid: number, body: string) {
          rejectNote = body;
        },
      } as GitlabClient,
    };
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrNotePayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toHaveLength(0);
    expect(rejectNote).toContain("Бюджет командных комментариев исчерпан");
    await app.close();
  });

  it("бюджет не исчерпан: 2 команды, текущая третья - запуск", async () => {
    const notes = [
      { id: 400, body: "@agent работа раз", username: "alice" },
      { id: 401, body: "просто комментарий", username: "alice" },
      { id: 402, body: "/oc работа два", username: "bob" },
    ];
    const fake = makeFakeClient();
    fake.client.mrNotes = async () => notes;
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrNotePayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toHaveLength(1);
    await app.close();
  });

  it("текущий комментарий не считается в бюджете", async () => {
    // На вебхуке заметка уже создана: id 500 в списке - это она сама,
    // в бюджет идут только предыдущие командные комментарии
    const notes = [
      { id: 400, body: "@agent работа раз", username: "alice" },
      { id: 401, body: "@agent работа два", username: "alice" },
      { id: 500, body: "@agent работа три", username: "alice" },
    ];
    const fake = makeFakeClient();
    fake.client.mrNotes = async () => notes;
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrNotePayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toHaveLength(1);
    await app.close();
  });

  it("команды ботов не входят в бюджет", async () => {
    const notes = [
      { id: 400, body: "@agent бот раз", username: "agent-bot" },
      { id: 401, body: "@agent бот два", username: "github-bot-1" },
      { id: 402, body: "@agent бот три", username: "someone_bot" },
    ];
    const fake = makeFakeClient();
    fake.client.mrNotes = async () => notes;
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, mrNotePayload());

    expect(res.statusCode).toBe(202);
    expect(fake.triggers).toHaveLength(1);
    await app.close();
  });

  it("бот в комментарии к MR - 403", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(
      app,
      mrNotePayload({ user: { username: "gitlab-bot-9" } }),
    );

    expect(res.statusCode).toBe(403);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });
});

describe("POST /webhook: прочее", () => {
  it("неизвестный object_kind - 204, пайплайн не запускается", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await post(app, { object_kind: "push" });

    expect(res.statusCode).toBe(204);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("битый JSON - 400", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await app.inject({
      method: "POST",
      url: "/webhook",
      headers: { "x-gitlab-token": SECRET, "content-type": "application/json" },
      payload: "{not json",
    });

    expect(res.statusCode).toBe(400);
    expect(fake.triggers).toHaveLength(0);
    await app.close();
  });

  it("GET /healthz - 200", async () => {
    const fake = makeFakeClient();
    const app = await buildApp({
      logger: false,
      webhookSecret: SECRET,
      gitlab: fake.client,
    });

    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
