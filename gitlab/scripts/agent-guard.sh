#!/usr/bin/env bash
# GitLab-версия guard-логики: аналог .github/scripts/agent-guard.sh (тикет #15).
#
# Вход - переменные пайплайна, выставленные вебхук-релеем (gitlab/relay/):
#   AGENT_EVENT        - 'note' (команда в комментарии) или 'issue' (новый тикет)
#   AGENT_USERNAME     - username автора события
#   AGENT_BODY         - тело комментария (note); для issue - пусто
#   AGENT_LABELS_COUNT - число меток issue (issue)
#   AGENT_MEMBER_OK    - 'true', если релей подтвердил участие с ролью Developer+
# Участие в проекте релей проверил через GitLab API; здесь перепроверяются
# боты и формат команды.
#
# Выход - dotenv-артефакт guard.env (секретов не содержит):
#   TRUSTED            - 'true', только если событие доверенное
#   AGENT_COMMAND_B64  - текст команды base64 (dotenv не умеет многострочные),
#                        пусто для issue-событий (там агент работает на triage)
#
# Правило то же, что в GitHub-версии: команда - тело с префиксом (@agent, /oc,
# /opencode), затем пробельный разделитель или конец строки; "@agentfoo" командой
# не считается. Кириллические гомоглифы в префиксе допускаются (русская
# раскладка: /ос вместо /oc). Внимание: bracket-классы при C-локали работают
# побайтово, префикс может совпасть с похожим кириллическим началом - допустимо,
# guard всё равно пускает дальше только доверенных от релея.
set -euo pipefail

username="${AGENT_USERNAME:-}"
body="${AGENT_BODY:-}"
member_ok="${AGENT_MEMBER_OK:-}"
labels_count="${AGENT_LABELS_COUNT:-0}"
event="${AGENT_EVENT:-}"

# Боты не доверенные в любом случае (включая самого агента, отвечающего
# комментарием): пайплайн не зацикливается
case "${username,,}" in
  *bot*) trusted_bot=false ;;
  *) trusted_bot=true ;;
esac

re='^(@[аaгgеeнnтt]+|/[оo][сc]|/[оo][пp][еe][нn][сc][оo][дd]?[еe])([[:space:]]+(.*))?$'
command=""
is_command=false
if [[ "$body" =~ $re ]]; then
  is_command=true
  command="${BASH_REMATCH[3]}"
fi

trusted=false
if [ "$member_ok" = "true" ] && [ "$trusted_bot" = true ]; then
  case "$event" in
    note)
      if [ "$is_command" = true ] && [ -n "$command" ]; then
        trusted=true
      fi
      ;;
    issue)
      # Автотриаж: только обращения без единой метки - готовые тикеты
      # (ready-for-agent) и разобранные не трогаются
      if [ "$labels_count" = "0" ]; then
        trusted=true
      fi
      ;;
    merge_request)
      # Авторевью MR: событие уже доверенное (релей отфильтровал ботов,
      # неучастников, форки и черновики); guard перепроверяет ботов
      trusted=true
      ;;
    mr_note)
      if [ "$is_command" = true ] && [ -n "$command" ]; then
        trusted=true
      fi
      ;;
  esac
fi

echo "TRUSTED=$trusted"
if [ -n "$command" ]; then
  echo "AGENT_COMMAND_B64=$(printf '%s' "$command" | base64 | tr -d '\n')"
else
  echo "AGENT_COMMAND_B64="
fi
