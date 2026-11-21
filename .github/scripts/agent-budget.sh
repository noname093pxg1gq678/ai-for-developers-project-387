#!/usr/bin/env bash
# Бюджет командных комментариев в PR (agent.yml, guard-джоба).
#
# Лимит защищает PR от бесконечного цикла "правка -> авторевью -> команда":
# командные комментарии считаются по обоим каналам PR (issue_comment и
# pull_request_review_comment), и когда лимит исчерпан, агент больше не
# запускается - публикуется limit_exhausted без вызова модели.
#
# Вход - переменные окружения:
#   COMMENTS_JSON - JSON-массив комментариев PR (потоки issues/<n>/comments и
#     pulls/<n>/comments слиты вместе; guard-джоба заранее обогащает каждый
#     элемент полем author_permission из collaborators API):
#     [{"user": {"type": "User"|"Bot", "login": "..."},
#       "author_permission": "admin"|"maintain"|"write"|...,
#       "body": "..."}, ...]
#   BUDGET_LIMIT  - лимит командных комментариев на PR (по умолчанию 3)
#
# Комментарий текущей команды уже в списке (событие created случилось до
# подсчёта), поэтому исчерпание - это used > limit: лимит 3 означает не
# более трёх запусков агента на PR.
#
# Выход - строки формата GITHUB_OUTPUT в stdout:
#   budget_used      - число командных комментариев доверенных не-ботов
#   budget_exhausted - 'true', если текущая команда сверх лимита
#
# Считаются только комментарии, которые запускают агента: тело - команда
# (та же логика, что в agent-guard.sh) и автор не бот с правом admin,
# maintain или write. Комментарий бота не считается в любом случае.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/agent-guard.sh"

limit="${BUDGET_LIMIT:-3}"
comments="${COMMENTS_JSON:-[]}"
used=0

while IFS= read -r comment; do
  [ -n "$comment" ] || continue
  type="$(jq -r '.user.type // ""' <<<"$comment")"
  body="$(jq -r '.body // ""' <<<"$comment")"
  permission="$(jq -r '.author_permission // ""' <<<"$comment")"

  [ "$type" != "Bot" ] || continue
  parse_command "$body" || continue
  case "$permission" in
    admin | maintain | write) used=$((used + 1)) ;;
  esac
done < <(jq -c '.[]' <<<"$comments" 2>/dev/null)

echo "budget_used=$used"
if [ "$used" -gt "$limit" ]; then
  echo "budget_exhausted=true"
else
  echo "budget_exhausted=false"
fi
