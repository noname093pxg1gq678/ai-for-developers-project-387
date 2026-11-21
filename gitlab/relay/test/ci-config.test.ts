import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// .gitlab-ci.yml - декларативный файл, верифицируется структурно: YAML-парсинг
// плюс инварианты контура (джобы, needs, rules, таймауты, права токенов).

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const file = path.join(repoRoot, ".gitlab-ci.yml");
const config = parse(readFileSync(file, "utf8"), {
  merge: true,
}) as Record<string, any>;

function scriptOf(job: string): string {
  return (config[job].script as string[]).join("\n");
}

describe(".gitlab-ci.yml", () => {
  it("валидный YAML со стадиями guard -> agent -> publish -> check -> review -> audit", () => {
    expect(config).not.toBeNull();
    expect(config.stages).toEqual([
      "guard",
      "agent",
      "publish",
      "check",
      "review",
      "audit",
    ]);
    for (const job of [
      "guard-dotenv",
      "agent",
      "publish",
      "check",
      "review",
      "runtime-check",
      "audit",
      "release-please",
    ]) {
      expect(config[job], `джоба ${job} отсутствует`).toBeDefined();
    }
  });

  it("workflow: релейные события, MR-пайплайны, push в main, schedule и web", () => {
    const conditions = config.workflow.rules.map((r: { if: string }) => r.if);
    expect(conditions).toContainEqual("$AGENT_EVENT");
    expect(conditions).toContainEqual(
      "$CI_PIPELINE_SOURCE == 'merge_request_event'",
    );
    expect(conditions).toContainEqual(
      "$CI_PIPELINE_SOURCE == 'push' && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH",
    );
    expect(conditions).toContainEqual("$CI_PIPELINE_SOURCE == 'schedule'");
    expect(conditions).toContainEqual("$CI_PIPELINE_SOURCE == 'web'");
  });

  it("rules не читают переменные из dotenv-артефактов (вычисляются при создании пайплайна)", () => {
    // TRUSTED и WORK_PUBLISHED вычисляются guard/agent-джобами: в rules их
    // видеть нельзя, проверка переезжает внутрь скриптов
    for (const job of ["agent", "publish", "review", "runtime-check"]) {
      for (const rule of config[job].rules) {
        expect(
          rule.if,
          `${job}: rules не должен зависеть от dotenv-переменных`,
        ).not.toMatch(/TRUSTED|WORK_PUBLISHED/);
      }
    }
    // Гейт доверенности - внутри скриптов джоб
    expect(scriptOf("agent")).toContain('[ "$TRUSTED" = "true" ]');
    expect(scriptOf("publish")).toContain('[ "$WORK_PUBLISHED" = "true" ]');
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

  it("agent: needs guard-dotenv, timeout 20m, resource_group по issue", () => {
    const job = config.agent;
    expect(job.needs).toContain("guard-dotenv");
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

  it("agent: MR-режим - head-ветка чекаутится до удаления remote", () => {
    const before = config.agent.before_script.join("\n");
    const fetchIdx = before.indexOf("git fetch origin");
    const removeIdx = before.indexOf("git remote remove origin");
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(removeIdx).toBeGreaterThan(fetchIdx);
  });

  it("publish: needs agent, пуш и MR токеном доставки; MR-режим обновляет ветку", () => {
    const job = config.publish;
    expect(job.needs).toContain("agent");
    expect(job.timeout).toBe("5m");
    const script = scriptOf("publish");
    expect(script).toContain("PUSH_TOKEN");
    expect(script).toContain("git push");
    expect(script).toContain("merge_requests");
    expect(script).toContain("MR_IID");
  });

  it("агентные правила gitlab-варианта подключаются в промпт (issue и MR режимы)", () => {
    const script = scriptOf("agent");
    expect(script).toContain("gitlab/agent-rules-glab.txt");
    expect(script).toContain("gitlab/agent-mr-rules-glab.txt");
  });

  it("check: CI-проверки на MR и push в main, полный чек + контур GitLab", () => {
    const job = config.check;
    expect(job.stage).toBe("check");
    const rules = job.rules.map((r: { if: string }) => r.if);
    expect(rules).toContainEqual(
      "$CI_PIPELINE_SOURCE == 'merge_request_event'",
    );
    expect(rules).toContainEqual(
      "$CI_PIPELINE_SOURCE == 'push' && $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH",
    );
    const script = scriptOf("check");
    expect(script).toContain("mise run check");
    expect(script).toContain("npm run contract:check");
    expect(script).toContain("mise run test:relay");
    expect(script).toContain("mise run test:guard");
    expect(script).toContain(".github/scripts/agent-guard.test.sh");
  });

  it("review: авторевью MR по событию merge_request от релея, публикация комментарием", () => {
    const job = config.review;
    expect(job.stage).toBe("review");
    expect(job.needs).toContain("guard-dotenv");
    expect(job.rules).toContainEqual({ if: '$AGENT_EVENT == "merge_request"' });
    expect(job.timeout).toBe("15m");
    const script = scriptOf("review");
    expect(script).toContain("REVIEW.md");
    expect(script).toContain("glab mr note");
    expect(script).toContain("opencode run -m opencode-go/glm-5.3-flash");
    // Авторевью код не меняет: пуша в скрипте нет
    expect(script).not.toContain("git push");
  });

  it("runtime-check: без модели, head SHA и e2e-артефакты", () => {
    const job = config["runtime-check"];
    expect(job.rules).toContainEqual({ if: '$AGENT_EVENT == "merge_request"' });
    const script = scriptOf("runtime-check");
    expect(script).toContain("rev-parse HEAD");
    expect(script).toContain("mise run e2e");
    expect(script).not.toContain("opencode");
    expect(job.artifacts.paths).toContain("head-sha.txt");
    expect(job.artifacts.paths).toContain("e2e-artifacts/");
  });

  it("audit: расписание и ручной запуск, Lighthouse + агент, отсутствие данных не роняет джобу", () => {
    const job = config.audit;
    const rules = job.rules.map((r: { if: string }) => r.if);
    expect(rules).toContainEqual('$CI_PIPELINE_SOURCE == "schedule"');
    expect(rules).toContainEqual('$CI_PIPELINE_SOURCE == "web"');
    const script = scriptOf("audit");
    expect(script).toContain("lighthouse@12");
    expect(script).toContain("gitlab/audit-prompt-glab.txt");
    expect(script).toContain("TRAINING_FINDING");
    // Сбор падает мягко: агент размечает отсутствие данных
    expect(script).toContain("if npx --yes lighthouse@12");
    expect(script).toContain("AUDIT_TRACKING_ISSUE");
  });

  it("release-please: ручной запуск с RELEASE=true", () => {
    const job = config["release-please"];
    expect(job.rules).toContainEqual({
      if: '$CI_PIPELINE_SOURCE == "web" && $RELEASE == "true"',
    });
    expect(scriptOf("release-please")).toContain("release-please");
  });
});
