# AGENTS.md

Рабочие правила проекта. Продукт, сценарии и требования - в README.md.

## Команды

- `mise run setup` - установить зависимости (npm) и git-хуки (hk)
- `mise run dev` - поднять дев-серверы: бекенд :3000, фронтенд :5173. Остановить: `mise daemons stop`, логи: `mise daemons logs backend|frontend`
- `mise run check` - все проверки: линт (oxlint, oxfmt, jactionlint, mise fmt), типы (tsc), сборка, тесты (vitest), e2e (Playwright). Эту же команду запускает CI
- `mise run fix` - автофиксы линта и форматирования
- `mise run e2e` - e2e-тесты Playwright: сборка, установка chromium, прогон браузерного сценария против настоящего сервера (собранное приложение одним процессом, без моков API)
- По отдельности: `mise run test`, `mise run lint`, `mise run typecheck`, `mise run build`
- Команды в issues и PR (`@agent`, `/oc`, `/opencode`) запускают агента в GitHub Actions (`.github/workflows/agent.yml`); агент отвечает комментарием там же, где пришла команда. В PR работает и построчный канал (комментарий к строке), а правки агента идут в head-ветку PR; командных комментариев на PR - не больше 3 (бюджет guard-джобы)
- Авторевью PR (`.github/workflows/pr-review.yml`): на событиях PR агент публикует замечания по критериям `REVIEW.md` комментарием; форки не получают секрет модели, PR агента тоже ревьюится; код авторевью не меняет

Версии инструментов (node, hk, oxlint, oxfmt, pitchfork, jactionlint) зафиксированы в `mise.toml`; `mise install` их ставит, а mise-хук postinstall после установки запускает `npm install`.

## Устройство

- `backend/` - Fastify на TypeScript (ESM): вход `src/index.ts`, сборка приложения `src/app.ts`, тесты `test/`
- `frontend/` - React + Vite + Mantine; дев-сервер проксирует `/api` на бекенд (`vite.config.ts`)
- npm workspaces: общие команды через `npm run <script> --workspaces`
- Git-хуки через hk (`hk.pkl`): pre-commit форматирует и линтит изменённые файлы, commit-msg проверяет формат коммита, pre-push и `hk check --all` гоняют всё
- CI (`.github/workflows/check.yml`) на каждый push ставит инструменты через mise и запускает `mise run check`

## Правила

- Коммиты только в формате Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, опционально со scope - `feat(api): ...`. Хук commit-msg отклоняет нарушения
- Коммиты реализации ссылаются на тикет: номер в конце темы или в теле - `feat(booking): форма гостя (#12)`. Закрытие тикета - комментарием с перечнем коммитов, затем `gh issue close`
- В тексте проекта (код, коммиты, документация) не используется em dash - только обычный дефис `-`
- Файлы `.github/workflows/hexlet-check.yml` и `.github/workflows/README.md` принадлежат Хекслету: их нельзя менять
- ESLint и Prettier не подключать: линт - oxlint, форматирование - oxfmt, запуск через hk
- API строится от контракта: TypeSpec -> OpenAPI -> клиентский SDK; сервер пишется по контракту и проверяется тестами

## Сгенерированные артефакты

- `contract/generated/openapi.json` и `frontend/src/api/` создаются командой `npm run contract:generate` (TypeSpec -> OpenAPI -> SDK через `@hey-api/openapi-ts`) и руками не редактируются: правки затирает следующая генерация
- Свежесть генератов проверяет `npm run contract:check` - регенерация плюс `git diff --exit-code`; этот шаг выполняется в CI после `mise run check`
- Серверные артефакты не генерируются: подходящего генератора маршрутов для Fastify нет, сервер пишется вручную по контракту (зафиксировано в README)

## Agent skills

### Issue tracker

Задачи и спеки живут в GitHub Issues этого репозитория, операции через `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Используются пять дефолтных меток: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: один GLOSSARY.md и docs/adr/ в корне репозитория. See `docs/agents/domain.md`.
