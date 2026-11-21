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

echo '----'
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
