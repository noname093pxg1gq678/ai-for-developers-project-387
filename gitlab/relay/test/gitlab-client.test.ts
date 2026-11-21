import { describe, expect, it } from "vitest";
import { HttpGitlabClient } from "../src/gitlab.js";

// Сеть инъекцией: настоящих вызовов нет, проверяем маппинг вызова в HTTP.

function makeFetch(response: { status: number; body?: string }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(response.body ?? "", {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { calls, fetchImpl };
}

describe("HttpGitlabClient: memberAccessLevel", () => {
  it("GET members/all/:username с релейным токеном, возвращает access_level", async () => {
    const fake = makeFetch({ status: 200, body: '{"access_level":30}' });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    const level = await client.memberAccessLevel(7, "alice");

    expect(level).toBe(30);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe(
      "https://gitlab.example.com/api/v4/projects/7/members/all/alice",
    );
    const headers = fake.calls[0]?.init.headers as Record<string, string>;
    expect(headers["PRIVATE-TOKEN"]).toBe("relay-token");
  });

  it("не участник (404) -> null", async () => {
    const fake = makeFetch({
      status: 404,
      body: '{"message":"404 Not found"}',
    });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    const level = await client.memberAccessLevel(7, "bob");

    expect(level).toBeNull();
  });

  it("другая ошибка API бросает исключение", async () => {
    const fake = makeFetch({ status: 500, body: "{}" });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    await expect(client.memberAccessLevel(7, "alice")).rejects.toThrow(
      /GitLab API/,
    );
  });
});

describe("HttpGitlabClient: triggerPipeline", () => {
  it("POST /projects/:id/pipeline с ref=main и переменными", async () => {
    const fake = makeFetch({ status: 201, body: '{"id":1}' });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    await client.triggerPipeline(7, {
      AGENT_EVENT: "note",
      AGENT_USERNAME: "alice",
      AGENT_BODY: "@agent привет",
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
    });

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.url).toBe(
      "https://gitlab.example.com/api/v4/projects/7/pipeline",
    );
    expect(fake.calls[0]?.init.method).toBe("POST");
    const headers = fake.calls[0]?.init.headers as Record<string, string>;
    expect(headers["PRIVATE-TOKEN"]).toBe("relay-token");
    const body = JSON.parse(String(fake.calls[0]?.init.body)) as {
      ref: string;
      variables: Array<{ key: string; value: string }>;
    };
    expect(body.ref).toBe("main");
    expect(body.variables).toContainEqual({ key: "ISSUE_IID", value: "42" });
    expect(body.variables).toContainEqual({
      key: "AGENT_EVENT",
      value: "note",
    });
  });

  it("ошибка запуска пайплайна бросает исключение", async () => {
    const fake = makeFetch({
      status: 400,
      body: '{"message":"ref is missing"}',
    });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    await expect(
      client.triggerPipeline(7, {
        AGENT_EVENT: "note",
        AGENT_USERNAME: "a",
        AGENT_BODY: "",
        AGENT_LABELS_COUNT: "0",
        AGENT_MEMBER_OK: "true",
        AGENT_ISSUE_IID: "1",
        AGENT_ISSUE_AUTHOR: "r",
        ISSUE_IID: "1",
        ISSUE_AUTHOR: "r",
        MR_IID: "",
        MR_SOURCE_BRANCH: "",
        MR_TARGET_BRANCH: "",
        MR_TITLE: "",
      }),
    ).rejects.toThrow(/GitLab API/);
  });
});

describe("HttpGitlabClient: mrNotes", () => {
  it("GET merge_requests/:iid/notes, возвращает id/body/username", async () => {
    const fake = makeFetch({
      status: 200,
      body: JSON.stringify([
        { id: 400, body: "@agent работа", author: { username: "alice" } },
        { id: 401, body: "спасибо", author: { username: "bob" } },
      ]),
    });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    const notes = await client.mrNotes(7, 12);

    expect(notes).toEqual([
      { id: 400, body: "@agent работа", username: "alice" },
      { id: 401, body: "спасибо", username: "bob" },
    ]);
    expect(fake.calls[0]?.url).toBe(
      "https://gitlab.example.com/api/v4/projects/7/merge_requests/12/notes?per_page=100",
    );
    const headers = fake.calls[0]?.init.headers as Record<string, string>;
    expect(headers["PRIVATE-TOKEN"]).toBe("relay-token");
  });

  it("ошибка API бросает исключение", async () => {
    const fake = makeFetch({ status: 500, body: "{}" });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    await expect(client.mrNotes(7, 12)).rejects.toThrow(/GitLab API/);
  });
});

describe("HttpGitlabClient: postMrNote", () => {
  it("POST merge_requests/:iid/notes с телом комментария", async () => {
    const fake = makeFetch({ status: 201, body: '{"id":500}' });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    await client.postMrNote(7, 12, "Бюджет командных комментариев исчерпан");

    expect(fake.calls[0]?.url).toBe(
      "https://gitlab.example.com/api/v4/projects/7/merge_requests/12/notes",
    );
    expect(fake.calls[0]?.init.method).toBe("POST");
    const body = JSON.parse(String(fake.calls[0]?.init.body)) as {
      body: string;
    };
    expect(body.body).toBe("Бюджет командных комментариев исчерпан");
  });

  it("ошибка API бросает исключение", async () => {
    const fake = makeFetch({ status: 400, body: "{}" });
    const client = new HttpGitlabClient(
      "https://gitlab.example.com",
      "relay-token",
      fake.fetchImpl,
    );

    await expect(client.postMrNote(7, 12, "текст")).rejects.toThrow(
      /GitLab API/,
    );
  });
});
