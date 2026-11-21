# Календарь звонков (продолжение)


[![hexlet-check](https://github.com/noname093pxg1gq678/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/noname093pxg1gq678/ai-for-developers-project-387/actions)

Интегрируйте работу агентов в GitHub проект

Продолжение первого проекта «Календарь звонков»: сервис записи на звонок по мотивам Cal.com. Владелец публикует типы встреч, гость без регистрации выбирает свободный слот и записывается.

Исходный проект: https://github.com/noname093pxg1gq678/ai-for-developers-project-386 - в его трекере история спецификации и решений, по нему собраны ссылки на спеки и закрывающие комментарии тикетов. Словарь (`GLOSSARY.md`) и решения (`docs/adr/`) перенесены в этот репозиторий.

Работающее приложение первого проекта: **https://call-booking-production-85a10cee.up.railway.app** - тот же Docker-образ из корневого `Dockerfile`, деплой на Railway из ветки main. Данные хранятся в памяти процесса: перезапуск сервиса сбрасывает типы встреч и бронирования.

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Стек

- **Контракт:** TypeSpec → OpenAPI 3.0 → клиентский SDK (`@hey-api/openapi-ts`); генерация одной командой, дрейф проверяется в CI
- **Бекенд:** Node.js + TypeScript + Fastify; данные в памяти процесса
- **Фронтенд:** React (Vite) + TypeScript + Mantine; API-клиент генерируется из OpenAPI
- **Тесты:** Vitest (юнит и API через inject) + Playwright (e2e-браузерный сценарий против настоящего сервера)
- **Инструменты:** mise (версии и задачи), hk (git-хуки), oxlint + oxfmt (линт и форматирование)
- **Сборка и запуск:** Docker; деплой на Railway

## Установка

Требуется [mise](https://mise.jdx.dev/). Команды проекта описаны в [AGENTS.md](AGENTS.md).

```bash
git clone https://github.com/noname093pxg1gq678/ai-for-developers-project-387.git
cd ai-for-developers-project-387
mise run setup   # инструменты, npm-зависимости, git-хуки
mise run dev     # бекенд http://localhost:3000, фронтенд http://localhost:5173
```

Все проверки: `mise run check` - линт, типы, сборка, юнит-тесты, e2e против настоящего сервера, свежесть генератов. Эту же команду запускает CI на каждый push.

## Использование

Локально: приложение - http://localhost:5173, бекенд (только API) - http://localhost:3000. Панель владельца доступна только по прямому URL http://localhost:3000/admin - переходов между поверхностями нет (см. [ADR 0001](docs/adr/0001-disconnected-surfaces.md)).

В контейнере - один образ: бекенд раздаёт собранный фронтенд и API на одном порту :3000 (порт берётся из переменной окружения `PORT`):

```bash
docker build -t call-booking .
docker run --rm -p 3000:3000 call-booking
```

Работающая версия: https://call-booking-production-85a10cee.up.railway.app

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` - не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) - школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий - один из таких проектов.
