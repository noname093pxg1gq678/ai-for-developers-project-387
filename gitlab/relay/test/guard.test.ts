import { describe, expect, it } from "vitest";
import { isBotActor, parseCommand } from "../src/guard.js";

// Эталон - кейсы из .github/scripts/agent-guard.test.sh (GitHub-версия guard),
// та же логика префиксов и гомоглифов, переносимая на GitLab.

describe("parseCommand", () => {
  it.each([
    ["@agent почини тесты", "почини тесты"],
    ["/oc сделай X", "сделай X"],
    ["/opencode   Leading-spaces-stripped", "Leading-spaces-stripped"],
    // Кириллические гомоглифы: на русской раскладке префиксы печатаются кириллицей
    ["/ос подтверждаю спеку и тикеты", "подтверждаю спеку и тикеты"],
    ["@агент привет", "привет"],
    ["/опенсоде что нового", "что нового"],
    // Кавычки, доллары и кириллица проходят без искажений
    [
      '@agent кавычки "в кавычках" и $dollar и кириллица',
      'кавычки "в кавычках" и $dollar и кириллица',
    ],
    ["@agent первая строка\nвторая строка", "первая строка\nвторая строка"],
  ])("команда %j -> %j", (body, command) => {
    expect(parseCommand(body)).toBe(command);
  });

  it.each([
    ["plain text without prefix"],
    ["@agentfoo not a command"],
    ["/ocfoo"],
    [" /oc leading space: not a command"],
    ["@agent"],
    ["/opencode   "],
  ])("не команда: %j", (body) => {
    expect(parseCommand(body)).toBeNull();
  });
});

describe("isBotActor", () => {
  it.each([
    [{ username: "alice" }, false],
    [{ username: "github-actions" }, false],
    // боты GitLab: project_bot-пользователи и токен-боты
    [{ username: "project_12_bot_5f4a2b" }, true],
    [{ username: "relay-bot" }, true],
    // явный флаг бота из payload
    [{ username: "alice", bot: true }, true],
  ])("%j -> %j", (actor, expected) => {
    expect(isBotActor(actor)).toBe(expected);
  });
});
