import type { GitlabClient, PipelineVariables } from "./app.js";

const API_PREFIX = "/api/v4";

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${API_PREFIX}${path}`;
}

/**
 * Настоящий клиент GitLab API self-hosted инстанса. Токен - project access
 * token релея (scope api). В тестах fetch инъекцией, настоящих вызовов нет.
 */
export class HttpGitlabClient implements GitlabClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async memberAccessLevel(
    projectId: number,
    username: string,
  ): Promise<number | null> {
    const url = apiUrl(
      this.baseUrl,
      `/projects/${projectId}/members/all/${encodeURIComponent(username)}`,
    );
    const res = await this.fetchImpl(url, {
      headers: { "PRIVATE-TOKEN": this.token },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`GitLab API вернул ${res.status} на ${url}`);
    }
    const body = (await res.json()) as { access_level?: number };
    return typeof body.access_level === "number" ? body.access_level : null;
  }

  async triggerPipeline(
    projectId: number,
    variables: PipelineVariables,
  ): Promise<void> {
    const url = apiUrl(this.baseUrl, `/projects/${projectId}/pipeline`);
    const body = JSON.stringify({
      ref: "main",
      variables: Object.entries(variables).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    });
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": this.token,
        "content-type": "application/json",
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`GitLab API вернул ${res.status} на ${url}`);
    }
  }
}
