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
