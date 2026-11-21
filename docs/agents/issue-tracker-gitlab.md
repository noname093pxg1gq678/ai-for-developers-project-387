# Issue tracker: GitLab (self-hosted)

Задачи и спеки живут в issues self-hosted GitLab-инстанса. Все операции - через `glab`. GitHub-версия инструкций (`docs/agents/issue-tracker.md`) описывает `gh` - здесь она не действует.

## Подключение

Инстанс задаётся переменной `GITLAB_HOST` (адрес без схемы, например `gitlab.example.com`), токен - переменной `GITLAB_TOKEN` (project access token со scope `api`). В agent-джобе пайплайна обе уже заданы; на локальной машине их нужно выставить руками. Если их нет - один раз залогиниться интерактивно:

```bash
export GITLAB_HOST="gitlab.example.com"
glab auth login --host "$GITLAB_HOST"
```

Проверка: `glab auth status --host "$GITLAB_HOST"`. Репозиторий `glab` определяет сам по `git remote -v`; в чекауте agent-джобы remote удалён - передавайте репозиторий флагом `-R GROUP/PROJECT` или работайте по числовым ID.

## Conventions

- **Создать issue**: `glab issue create --title "..." --description "..."`. Многострочное описание - через файл: `glab issue create --title "..." --description-file body.md`.
- **Прочитать issue**: `glab issue view <iid>`, с комментариями: `glab issue view <iid> --comments`. В JSON: `glab issue view <iid> --output json`.
- **Список issues**: `glab issue list` с фильтрами `--state opened`, `--label <name>`, `--author <username>`. В JSON: `glab issue list --all --output json`.
- **Комментарий**: `glab issue note <iid> --message "..."`. Многострочный - через файл: `glab issue note <iid> < comment.md`.
- **Метки**: добавить - `glab issue update <iid> --label "needs-triage"`, убрать - `glab issue update <iid> --unlabel "needs-triage"`. Пять дефолтных меток проекта: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix (см. `docs/agents/triage-labels.md`).
- **Закрыть**: сначала комментарий с объяснением `glab issue note <iid> --message "..."`, затем `glab issue close <iid>`.
- **Похожие issues**: `glab issue list --search "<фраза>" --state opened`.

В GitLab номер issues и MR - одно числовое пространство внутри проекта: `#42` у issue и MR не пересекаются, путаницы как в GitHub (`#` для обеих сущностей) не возникает, но ID в URL и IID в API различаются - команды CLI работают с IID.

## Pull requests как поверхность

MR - поверхность доставки работы агента, а не запросов: ветку создаёт и пушит publish-джоба пайплайна (`.gitlab-ci.yml`), MR она же создаёт через API с токеном доставки (PUSH_TOKEN). Агент моделью MR не создаёт и не пушит.

Полезные команды:

- **Прочитать MR**: `glab mr view <iid>`, `glab mr view <iid> --comments`, `glab mr diff <iid>`.
- **Список открытых MR**: `glab mr list`.

## Что не переносится из GitHub-версии

- Sub-issues, blocked-by, wayfinding-мэпы: в self-hosted GitLab зависят от версии инстанса. Пока их нет - связи между тикетами фиксируются строкой `Part of #<родитель>` в начале описания или `Blocked by: #<n>` вверху описания ребёнка.
- Команды `gh api` - заменяются на `glab api <путь>` (тот же REST API `/api/v4`), либо на `curl --header "PRIVATE-TOKEN: $GITLAB_TOKEN" "$CI_API_V4_URL/..."`.

## Когда скилл говорит "publish to the issue tracker"

Создать GitLab issue (см. **Создать issue**).

## Когда скилл говорит "fetch the relevant ticket"

Прочитать как в **Прочитать issue**.
