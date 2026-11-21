/**
 * Guard-логика релея: аналог .github/scripts/agent-guard.sh, переносимый на
 * GitLab-события. Эталон поведения - кейсы в test/guard.test.ts (взяты из
 * .github/scripts/agent-guard.test.sh).
 */

export interface Actor {
  username: string;
  /**
   * Явный флаг бота из payload, если GitLab его проставляет
   * (project bot-пользователи и служебные пользователи).
   */
  bot?: boolean;
}

/**
 * Боты не доверенные в любом случае (включая самого агента, отвечающего
 * комментарием): пайплайн не зацикливается. Бот опознаётся по явному флагу
 * из payload или по "bot" в username (project_12_bot_5f4a2b, relay-bot).
 */
export function isBotActor(actor: Actor): boolean {
  return actor.bot === true || /bot/i.test(actor.username);
}

/**
 * Команда: тело начинается с префикса, затем пробельный разделитель или
 * конец строки. "@agentfoo" командой не считается. Возвращает текст после
 * префикса или null, если это не команда - включая голый префикс без текста
 * ("@agent") и префикс только с хвостовыми пробелами.
 *
 * Кириллические гомоглифы: на русской раскладке префиксы печатаются
 * кириллицей (/ос вместо /oc и так далее) - латинские буквы префикса
 * допускают кириллические двойники. В отличие от bash-версии, здесь нет
 * проблемы C-локали: JS-регэксп работает по кодпоинтам, а не по байтам.
 */
const commandRe =
  /^(@[аaгgеeнnтt]+|\/[оo][сc]|\/[оo][пp][еe][нn][сc][оo][дd]?[еe])(\s+(.*))?$/s;

export function parseCommand(body: string): string | null {
  const match = commandRe.exec(body);
  if (!match) {
    return null;
  }
  const command = match[3] ?? "";
  return command === "" ? null : command;
}
