#!/usr/bin/env bash
# Локальная проверка GitLab-версии guard-логики: событие имитируется переменными.
# Эталон кейсов - .github/scripts/agent-guard.test.sh плюс issue-фильтры релея.
# Запуск: bash gitlab/scripts/agent-guard.test.sh
set -u

cd "$(dirname "$0")"
pass=0
fail=0

check() {
  desc="$1"
  expected_trusted="$2"
  expected_command="$3"
  out=$(AGENT_EVENT="$G_EVENT" AGENT_USERNAME="$G_USER" AGENT_BODY="$G_BODY" \
    AGENT_LABELS_COUNT="$G_LABELS" AGENT_MEMBER_OK="$G_MEMBER" bash agent-guard.sh)
  got_trusted=$(printf '%s\n' "$out" | sed -n 's/^TRUSTED=//p')
  got_command=$(printf '%s\n' "$out" | sed -n 's/^AGENT_COMMAND_B64=//p' | tr -d '\n' | base64 -d)
  if [ "$got_trusted" = "$expected_trusted" ] && [ "$got_command" = "$expected_command" ]; then
    pass=$((pass + 1))
    echo "PASS: $desc"
  else
    fail=$((fail + 1))
    echo "FAIL: $desc"
    echo "  trusted: got [$got_trusted], want [$expected_trusted]"
    echo "  command: got [$got_command], want [$expected_command]"
  fi
}

# note-события: команды от доверенных
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='@agent почини тесты' check 'member + @agent' true 'почини тесты'
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='/oc сделай X' check 'member + /oc' true 'сделай X'
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='/ос подтверждаю спеку' check 'cyrillic /ос prefix' true 'подтверждаю спеку'
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='@агент привет' check 'cyrillic @агент prefix' true 'привет'
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='@agent кавычки "в кавычках" и $dollar' check 'quotes and dollar' true 'кавычки "в кавычках" и $dollar'
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='@agent первая строка
вторая строка' check 'multiline command' true 'первая строка
вторая строка'

# note-события: отказы (команда распарсена, но TRUSTED=false - agent-джоба не запустится)
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=false G_BODY='@agent привет' check 'not a member: not trusted' false 'привет'
G_EVENT=note G_USER=project_12_bot_5f4a2b G_LABELS=0 G_MEMBER=true G_BODY='@agent привет' check 'bot: never trusted' false 'привет'
G_EVENT=note G_USER=agent-bot G_LABELS=0 G_MEMBER=true G_BODY='@agent привет' check 'bot username: never trusted' false 'привет'
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='plain text without prefix' check 'not a command' false ''
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='@agentfoo not a command' check '@agentfoo: not a command' false ''
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='@agent' check 'bare prefix without text' false ''
G_EVENT=note G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY=' /oc leading space: not a command' check 'leading space: not a command' false ''

# issue-события: автотриаж
G_EVENT=issue G_USER=alice G_LABELS=0 G_MEMBER=true G_BODY='' check 'issue without labels' true ''
G_EVENT=issue G_USER=alice G_LABELS=2 G_MEMBER=true G_BODY='' check 'labeled issue: skipped' false ''
G_EVENT=issue G_USER=project_12_bot_5f4a2b G_LABELS=0 G_MEMBER=true G_BODY='' check 'bot issue: not trusted' false ''
G_EVENT=issue G_USER=alice G_LABELS=0 G_MEMBER=false G_BODY='' check 'not member issue: not trusted' false ''

echo '----'
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
