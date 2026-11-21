import { expect, test } from "@playwright/test";

// Сценарий продукта целиком против настоящего сервера (issue #13): тип
// встречи создаётся обычным API-запросом по контракту, гость проходит
// запись в браузере через настоящий SDK в странице, бронь видна владельцу
// и закрывает слот. Без моков и подмены ответов. Данные хранятся в памяти
// процесса сервера, поэтому сценарий один, а ассерты - о фактах появления
// записей: без фиксированных дат и времени (окно записи сдвигается).

const TYPE_TITLE = "Звонок на 45 минут";
const TYPE_DESCRIPTION =
  "Созвон для обсуждения проекта. Подготовьте вопросы заранее.";
const TYPE_DURATION_MINUTES = 45;
const GUEST_NAME = "Мария Петрова";
const GUEST_EMAIL = "maria@example.com";
const GUEST_TOPIC = "Обсуждение проекта";
const GUEST_COMMENT = "Хочу обсудить проект";

test("гость записывается на слот, владелец видит бронь, слот закрывается", async ({
  page,
  request,
}) => {
  // 1. Тип встречи через API по контракту.
  const createResponse = await request.post("/api/meeting-types", {
    data: {
      title: TYPE_TITLE,
      description: TYPE_DESCRIPTION,
      durationMinutes: TYPE_DURATION_MINUTES,
    },
  });
  expect(createResponse.status()).toBe(201);
  const meetingType = await createResponse.json();

  // 2. Публичная страница: карточка типа есть, переход на страницу записи.
  await page.goto("/");
  const typeCard = page.getByRole("link", { name: TYPE_TITLE });
  await expect(typeCard).toBeVisible();
  await typeCard.click();
  await expect(page).toHaveURL(new RegExp(`/book/${meetingType.id}$`));

  // 3. Календарь-полоса: клик по первому активному дню. Работает в любой
  // день недели и в любое время суток: активны только дни со слотами.
  const firstOpenDay = page
    .locator("button:not([disabled])")
    .filter({ hasText: /\d{2}\.\d{2}/ })
    .first();
  await expect(firstOpenDay).toBeVisible();
  const dayLabel = (await firstOpenDay.textContent()) ?? "";
  await firstOpenDay.click();

  // 4. Первый активный слот, форма гостя, бронирование.
  const firstSlot = page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first();
  await expect(firstSlot).toBeVisible();
  const slotLabel = (await firstSlot.textContent()) ?? "";
  await firstSlot.click();

  await page.getByLabel("Тема разговора").fill(GUEST_TOPIC);
  await page.getByLabel("Имя").fill(GUEST_NAME);
  await page.getByLabel("Email").fill(GUEST_EMAIL);
  await page.getByLabel("Комментарий").fill(GUEST_COMMENT);
  await page.getByRole("button", { name: "Записаться" }).click();

  // 5. Экран успеха с деталями встречи: тема рядом с записью.
  await expect(
    page.getByRole("heading", { name: "Вы записаны" }),
  ).toBeVisible();
  await expect(page.getByText(TYPE_TITLE)).toBeVisible();
  await expect(page.getByText(GUEST_TOPIC)).toBeVisible();
  await expect(page.getByText(GUEST_NAME)).toBeVisible();
  await expect(page.getByText(GUEST_COMMENT)).toBeVisible();

  // 6. Панель владельца: бронь в «Предстоящих встречах» с темой, гостем,
  // датой и временем (время любое - проверяем факт записи).
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Предстоящие встречи" }),
  ).toBeVisible();
  const meetingCard = page.locator("li").filter({ hasText: GUEST_NAME });
  await expect(meetingCard).toBeVisible();
  await expect(meetingCard.getByText(TYPE_TITLE)).toBeVisible();
  // Тема в карточке встречи заметно выделена перед именем гостя.
  await expect(meetingCard.getByText(GUEST_TOPIC)).toBeVisible();
  await expect(meetingCard.getByText(GUEST_COMMENT)).toBeVisible();
  await expect(meetingCard.getByText(/\d{2}:\d{2}/)).toBeVisible();

  // 7. Повторное открытие страницы записи: забронированный слот больше
  // не предлагается.
  await page.goto(`/book/${meetingType.id}`);
  await expect(
    page.getByRole("button", { name: /\d{2}\.\d{2}/ }).first(),
  ).toBeVisible();
  const bookedDay = page.getByRole("button", { name: dayLabel, exact: true });
  // День мог опустеть целиком: тогда он неактивен, а его слоты и подавно
  // недоступны. Если день активен - открываем его сетку.
  if (await bookedDay.isEnabled()) {
    await bookedDay.click();
    // У активного дня есть свободные старты: ждём сетку перед ассертом.
    await expect(
      page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first(),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: slotLabel, exact: true }),
  ).toHaveCount(0);
});
