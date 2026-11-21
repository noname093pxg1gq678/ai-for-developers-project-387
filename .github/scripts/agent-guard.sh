#!/usr/bin/env bash
# Guard-логика агент-воркфлоу (событие issue_comment created).
#
# Вход - переменные окружения (в воркфлоу заполняются из события и шага permission):
#   COMMENTER_TYPE          - github.event.comment.user.type ('User' или 'Bot')
#   COMMENTER_LOGIN         - github.event.comment.user.login
#   COMMENT_BODY            - github.event.comment.body
#   COLLABORATOR_PERMISSION - permission из collaborators API (пусто, если шаг пропущен)
#
# Выход - строки формата GITHUB_OUTPUT в stdout:
#   trusted - 'true', только если комментатор не бот, имеет право
#     admin, maintain или write, и тело комментария - команда с непустым
#     текстом после префикса (@agent, /oc, /opencode)
#   command - текст команды без префикса (пустая строка, если не команда)
#
# Боты (включая самого агента, отвечающего от github-actions[bot]) не доверенные:
# воркфлоу не зацикливается. Секреты в guard-джобу не выдаются, форк-комментатор
# и бот доверенность не проходят.

# Разбор команды переиспользует agent-budget.sh: он считает командные
# комментарии в PR той же логикой (см. ниже).
COMMAND_RE='^(@[аaгgеeнnтt]+|/[оo][сc]|/[оo][пp][еe][нn][сc][оo][дd]?[еe])([[:space:]]+(.*))?$'

# Разбирает тело комментария: код возврата 0 - это команда, её текст в COMMAND_TEXT.
# Команда - тело с префиксом, затем пробельный разделитель или конец строки.
# "@agentfoo" командой не считается; голый префикс без текста - тоже.
#
# Кириллические гомоглифы: на русской раскладке префиксы печатаются кириллицей
# (/ос вместо /oc и так далее) - в проверке префикса латинские буквы допускают
# кириллические двойники. Текст команды берётся из оригинального тела и
# не транслитерируется. Внимание: при C-локали bracket-классы работают
# побайтово, поэтому префикс может совпасть с похожим кириллическим началом -
# допустимо, guard всё равно пускает только доверенных.
parse_command() {
  [[ "$1" =~ $COMMAND_RE ]] || return 1
  COMMAND_TEXT="${BASH_REMATCH[3]}"
  [ -n "$COMMAND_TEXT" ]
}

guard_run() {
  type="${COMMENTER_TYPE:-}"
  body="${COMMENT_BODY:-}"
  permission="${COLLABORATOR_PERMISSION:-}"

  case "$permission" in
    admin | maintain | write) trusted_permission=true ;;
    *) trusted_permission=false ;;
  esac

  command=""
  trusted=false
  if parse_command "$body"; then
    command="$COMMAND_TEXT"
    if [ "$type" != "Bot" ] && [ "$trusted_permission" = true ]; then
      trusted=true
    fi
  fi

  echo "trusted=$trusted"
  if [ -n "$command" ]; then
    echo "command<<__AGENT_COMMAND_EOF__"
    printf '%s\n' "$command"
    echo "__AGENT_COMMAND_EOF__"
  else
    echo "command="
  fi
}

# Сценарий вызывается и исполняется, и сорсится бюджет-скриптом (ради
# parse_command) - основной код гоняется только при прямом запуске.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
  guard_run
fi
