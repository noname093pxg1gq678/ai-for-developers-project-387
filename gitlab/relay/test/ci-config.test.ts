import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// .gitlab-ci.yml - декларативный файл, верифицируется структурно: YAML-парсинг
// плюс инварианты контура (джобы, needs, rules, таймауты, права токенов).

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const file = path.join(repoRoot, ".gitlab-ci.yml");
const config = parse(readFileSync(file, "utf8")) as Record<string, any>;

function scriptOf(job: string): string {
  return (config[job].script as string[]).join("\n");
}

describe(".gitlab-ci.yml", () => {
  it("валидный YAML с тремя джобами и стадиями guard -> agent -> publish", () => {
    expect(config).not.toBeNull();
    expect(config.stages).toEqual(["guard", "agent", "publish"]);
    for (const job of ["guard-dotenv", "agent", "publish"]) {
      expect(config[job], `джоба ${job} отсутствует`).toBeDefined();
    }
  });

  it("guard-dotenv: dotenv-артефакт из agent-guard.sh, без секретов", () => {
    const job = config["guard-dotenv"];
    expect(job.stage).toBe("guard");
    expect(job.timeout).toBe("5m");
    expect(scriptOf("guard-dotenv")).toContain("gitlab/scripts/agent-guard.sh");
    expect(job.artifacts.reports.dotenv).toBe("guard.env");
    const text = JSON.stringify(job);
    expect(text).not.toContain("OPENCODE_API_KEY");
    expect(text).not.toContain("PUSH_TOKEN");
  });

  it("agent: needs guard-dotenv, правило TRUSTED, timeout 20m, resource_group по issue", () => {
    const job = config.agent;
    expect(job.needs).toContain("guard-dotenv");
    expect(job.rules).toContainEqual({ if: '$TRUSTED == "true"' });
    expect(job.timeout).toBe("20m");
    expect(job.resource_group).toBe("issue-$ISSUE_IID");
  });

  it("agent: remote удаляется до запуска модели, токен пуша агенту недоступен", () => {
    expect(config.agent.before_script.join("\n")).toContain(
      "git remote remove origin",
    );
    // PUSH_TOKEN живёт только в publish-джобе: модель его не видит.
    // OPENCODE_API_KEY - masked+protected CI/CD-переменная, инжектируется
    // GitLab-раннером автоматически, поэтому в YAML не указывается.
    expect(JSON.stringify(config.agent)).not.toContain("PUSH_TOKEN");
    expect(scriptOf("agent")).toContain(
      "opencode run -m opencode-go/glm-5.3-flash",
    );
  });

  it("publish: needs agent, правило WORK_PUBLISHED, пуш и MR токеном доставки", () => {
    const job = config.publish;
    expect(job.needs).toContain("agent");
    expect(job.rules).toContainEqual({ if: '$WORK_PUBLISHED == "true"' });
    expect(job.timeout).toBe("5m");
    expect(job.resource_group).toBe("issue-$ISSUE_IID");
    const script = scriptOf("publish");
    expect(script).toContain("PUSH_TOKEN");
    expect(script).toContain("git push");
    expect(script).toContain("merge_requests");
  });

  it("агентные правила gitlab-варианта подключаются в промпт", () => {
    expect(scriptOf("agent")).toContain("gitlab/agent-rules-glab.txt");
  });
});
