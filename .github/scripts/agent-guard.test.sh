#!/usr/bin/env bash
# Локальная проверка guard-логики: событие имитируется переменными.
# Запуск: bash .github/scripts/agent-guard.test.sh
set -u

cd "$(dirname "$0")"
pass=0
fail=0

check() {
  desc="$1"
  expected_trusted="$2"
  expected_command="$3"
  out=$(COMMENTER_TYPE="$C_TYPE" COMMENTER_LOGIN="$C_LOGIN" COMMENT_BODY="$C_BODY" COLLABORATOR_PERMISSION="$C_PERM" bash agent-guard.sh)
  got_trusted=$(printf '%s\n' "$out" | sed -n 's/^trusted=//p')
  got_command=$(printf '%s\n' "$out" | sed -n '/^command<<__AGENT_COMMAND_EOF__$/,/^__AGENT_COMMAND_EOF__$/p' | sed '1d;$d')
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

C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='@agent почини тесты' check 'write + @agent' true 'почини тесты'
C_TYPE=User C_LOGIN=alice C_PERM=maintain C_BODY='/oc сделай X' check 'maintain + /oc' true 'сделай X'
C_TYPE=User C_LOGIN=alice C_PERM=admin C_BODY='/opencode   Leading-spaces-stripped' check 'admin + /opencode' true 'Leading-spaces-stripped'
C_TYPE=User C_LOGIN=bob C_PERM=read C_BODY='@agent привет' check 'read: not trusted' false 'привет'
C_TYPE=User C_LOGIN=bob C_PERM=none C_BODY='@agent привет' check 'none: not trusted' false 'привет'
C_TYPE=User C_LOGIN=bob C_PERM=triage C_BODY='@agent привет' check 'triage: not trusted' false 'привет'
C_TYPE=User C_LOGIN=carol C_PERM='' C_BODY='@agent привет' check 'no permission (step skipped): not trusted' false 'привет'
C_TYPE=Bot C_LOGIN=github-actions[bot] C_PERM=write C_BODY='@agent привет' check 'bot: never trusted' false 'привет'
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='plain text without prefix' check 'not a command' false ''
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='@agentfoo not a command' check '@agentfoo: not a command' false ''
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='/ocfoo' check '/ocfoo: not a command' false ''
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY=' /oc leading space: not a command' check 'leading space: not a command' false ''
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='@agent' check 'bare prefix without text' false ''
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='/opencode   ' check 'prefix plus spaces only' false ''

# Кавычки, доллары и кириллица должны проходить в command без искажений
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='@agent кавычки "в кавычках" и $dollar и кириллица' check 'quotes, dollar, cyrillic' true 'кавычки "в кавычках" и $dollar и кириллица'

# Кириллические гомоглифы в префиксе: на русской раскладке /oc печатается как /ос
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='/ос подтверждаю спеку и тикеты' check 'cyrillic /ос prefix' true 'подтверждаю спеку и тикеты'
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='@агент привет' check 'cyrillic @агент prefix' true 'привет'
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='/опенсоде что нового' check 'cyrillic /опенсоде prefix' true 'что нового'

# Многострочная команда
C_TYPE=User C_LOGIN=alice C_PERM=write C_BODY='@agent первая строка
вторая строка' check 'multiline command' true 'первая строка
вторая строка'

# ---- Бюджет командных комментариев в PR (agent-budget.sh) ----
#
# Шов: bash agent-budget.sh с env COMMENTS_JSON (массив комментариев PR,
#   issues- и review-потоки вместе; у каждого элемента user.type, user.login,
#   body и author_permission - его заполняет guard-джоба из collaborators API)
#   и BUDGET_LIMIT (по умолчанию 3).
# Выход: budget_used и budget_exhausted в формате GITHUB_OUTPUT.
#
# Считаются только командные комментарии доверенных НЕ-ботов; комментарий
# текущей команды воркфлоу передаёт в списке - исчерпание означает, что
# текущая команда уже сверх лимита.

check_budget() {
  desc="$1"
  expected_used="$2"
  expected_exhausted="$3"
  comments_json="$4"
  limit="${5:-3}"
  out=$(COMMENTS_JSON="$comments_json" BUDGET_LIMIT="$limit" bash agent-budget.sh)
  got_used=$(printf '%s\n' "$out" | sed -n 's/^budget_used=//p')
  got_exhausted=$(printf '%s\n' "$out" | sed -n 's/^budget_exhausted=//p')
  if [ "$got_used" = "$expected_used" ] && [ "$got_exhausted" = "$expected_exhausted" ]; then
    pass=$((pass + 1))
    echo "PASS: $desc"
  else
    fail=$((fail + 1))
    echo "FAIL: $desc"
    echo "  budget: got used [$got_used] exhausted [$got_exhausted], want used [$expected_used] exhausted [$expected_exhausted]"
  fi
}

cmd() {
  # cmd <type> <login> <permission> <body> - JSON-объект одного комментария
  printf '{"user":{"type":"%s","login":"%s"},"author_permission":"%s","body":%s}' "$1" "$2" "$3" "$(printf '%s' "$4" | jq -Rs .)"
}

budget_list="$(printf '%s\n' \
  "$(cmd User alice write '@agent поправь тесты')" \
  "$(cmd User alice write '/oc обнови спеку')" \
  "$(cmd User bob write '/oc третий запрос')" \
  "$(cmd User carol '' не команда вовсе)" \
  | jq -s .)"

check_budget 'budget 3: три команды ровно в лимит' 3 false "$budget_list" 3
check_budget 'budget 3: лимит задаётся переменной' 3 false "$budget_list" 4
check_budget 'budget 3: лимит исчерпан - четвёртая команда сверх' 3 true "$budget_list" 2

bot_list="$(printf '%s\n' \
  "$(cmd User alice write '@agent раз')" \
  "$(cmd User alice write '@agent два')" \
  "$(cmd Bot github-actions[bot] admin '@agent ответ агента не считается')" \
  "$(cmd User bob write '@agent три')" \
  | jq -s .)"

check_budget 'бюджет: комментарий бота не считается даже от админа' 3 false "$bot_list" 3

perm_list="$(printf '%s\n' \
  "$(cmd User dave read '@agent нет прав')" \
  "$(cmd User eve '' '@agent нет permission-шага')" \
  "$(cmd User alice write '@agent есть права')" \
  | jq -s .)"

check_budget 'бюджет: команды без доверенного права не считаются' 1 false "$perm_list" 3

mixed_list="$(printf '%s\n' \
  "$(cmd User alice write '/oc первая строка
вторая строка команды')" \
  "$(cmd User alice write 'plain text')" \
  "$(cmd User alice write '@agent')" \
  "$(cmd User alice write '/oc')" \
  | jq -s .)"

check_budget 'бюджет: многострочная команда считается, голый префикс нет' 1 false "$mixed_list" 3

check_budget 'бюджет: пустой список комментариев' 0 false '[]' 3

check_budget 'бюджет: отсутствующий JSON тоже пустой счёт' 0 false '' 3

echo '----'
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
