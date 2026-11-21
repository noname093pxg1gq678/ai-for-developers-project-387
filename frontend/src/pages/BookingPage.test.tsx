import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingPage from "./BookingPage";
import {
  PublicApiError,
  createBooking,
  loadBookingSlots,
  loadMeetingTypes,
} from "../data/publicApi";
import type { Meeting, MeetingType } from "../api";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../data/publicApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/publicApi")>();
  return {
    ...actual,
    loadMeetingTypes: vi.fn(),
    loadBookingSlots: vi.fn(),
    createBooking: vi.fn(),
  };
});

const typesMock = vi.mocked(loadMeetingTypes);
const slotsMock = vi.mocked(loadBookingSlots);
const createMock = vi.mocked(createBooking);

const SAMPLE_TYPE: MeetingType = {
  id: "call-45",
  title: "Звонок на 45 минут",
  description: "Созвон для обсуждения проекта.",
  durationMinutes: 45,
  createdAt: "2026-11-10T09:00:00Z",
};

const SAMPLE_MEETING: Meeting = {
  id: "meeting-1",
  typeId: "call-45",
  typeTitle: "Звонок на 45 минут",
  startsAt: "2026-11-16T06:00:00.000Z",
  topic: "Обсуждение проекта",
  guestName: "Мария Петрова",
  guestEmail: "maria@example.com",
  comment: "Хочу обсудить проект",
};

// Свободные старты окна от воскресенья 2026-11-15: понедельник 16 и среда 18.
const SAMPLE_SLOTS = [
  "2026-11-16T06:00:00.000Z",
  "2026-11-16T06:30:00.000Z",
  "2026-11-16T07:00:00.000Z",
  "2026-11-18T08:00:00.000Z",
];

function renderAt(url: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/book/:typeId" element={<BookingPage />} />
    </Routes>,
    url,
  );
}

beforeEach(() => {
  // Сегодня - воскресенье 2026-11-15, 13:00 по поясу владельца.
  vi.useFakeTimers({
    now: new Date("2026-11-15T10:00:00Z"),
    shouldAdvanceTime: true,
  });
  typesMock.mockReset();
  slotsMock.mockReset();
  createMock.mockReset();
  typesMock.mockResolvedValue([SAMPLE_TYPE]);
  slotsMock.mockResolvedValue(SAMPLE_SLOTS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("страница записи", () => {
  it("показывает заголовок, название, описание и длительность типа", async () => {
    renderAt("/book/call-45");

    expect(
      screen.getByRole("heading", { name: "Запись на встречу" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Звонок на 45 минут")).toBeInTheDocument();
    expect(
      screen.getByText("Созвон для обсуждения проекта."),
    ).toBeInTheDocument();
    expect(screen.getByText("45 минут")).toBeInTheDocument();
  });

  it("показывает календарь-полосу из 14 дней начиная с сегодня", async () => {
    renderAt("/book/call-45");

    const dayButtons = await screen.findAllByRole("button", {
      name: /\d{2}\.\d{2}/,
    });
    expect(dayButtons).toHaveLength(14);
    expect(
      screen.getByRole("button", { name: "вс, 15.11" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "сб, 28.11" }),
    ).toBeInTheDocument();
  });

  it("дни без свободных слотов и выходные неактивны", async () => {
    renderAt("/book/call-45");

    const enabled = await screen.findByRole("button", { name: "пн, 16.11" });
    expect(enabled).toBeEnabled();
    expect(screen.getByRole("button", { name: "ср, 18.11" })).toBeEnabled();

    // Сегодня - выходной без слотов, вторник - рабочий день без слотов.
    expect(screen.getByRole("button", { name: "вс, 15.11" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "вт, 17.11" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "чт, 19.11" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "сб, 21.11" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "пн, 23.11" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "сб, 28.11" })).toBeDisabled();
  });

  it("по умолчанию открыт первый день со слотами, время в поясе владельца", async () => {
    renderAt("/book/call-45");

    expect(
      await screen.findByRole("button", { name: "09:00" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "09:30" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10:00" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "11:00" })).toBeNull();
    expect(screen.getByRole("button", { name: "пн, 16.11" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("выбор другого дня открывает его сетку слотов", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/book/call-45");

    await user.click(await screen.findByRole("button", { name: "ср, 18.11" }));

    expect(
      await screen.findByRole("button", { name: "11:00" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "09:00" })).toBeNull();
    expect(screen.getByRole("button", { name: "ср, 18.11" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("без свободных слотов в окне показывает пустое состояние", async () => {
    slotsMock.mockResolvedValue([]);
    renderAt("/book/call-45");

    expect(
      await screen.findByText("На ближайшие 14 дней нет свободных слотов"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "пн, 16.11" })).toBeDisabled();
  });

  it("при ошибке загрузки слотов предлагает повторить и загружает снова", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    slotsMock.mockRejectedValueOnce(new Error("сеть недоступна"));
    slotsMock.mockResolvedValueOnce(SAMPLE_SLOTS);
    renderAt("/book/call-45");

    expect(
      await screen.findByText("Не удалось загрузить свободные слоты"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(
      await screen.findByRole("button", { name: "09:00" }),
    ).toBeInTheDocument();
  });

  it("для неизвестного типа показывает сообщение и путь к типам", async () => {
    typesMock.mockResolvedValue([]);
    renderAt("/book/unknown");

    expect(
      await screen.findByText("Тип встречи не найден"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ко всем типам встреч" }),
    ).toHaveAttribute("href", "/");
  });

  it("во время загрузки слотов не показывает ни сетку, ни пустое состояние", async () => {
    slotsMock.mockImplementation(() => new Promise<string[]>(() => {}));
    renderAt("/book/call-45");

    expect(await screen.findByText("Звонок на 45 минут")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "09:00" })).toBeNull();
    expect(
      screen.queryByText("На ближайшие 14 дней нет свободных слотов"),
    ).toBeNull();
  });
});

describe("форма гостя", () => {
  it("появляется после выбора слота: тема, имя, email, комментарий", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/book/call-45");

    await user.click(await screen.findByRole("button", { name: "09:00" }));

    expect(await screen.findByLabelText("Тема разговора")).toBeInTheDocument();
    expect(screen.getByLabelText("Имя")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Комментарий")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Записаться" }),
    ).toBeInTheDocument();
  });

  it("ошибки валидации без отправки: пустые поля, лимиты, неверный email", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/book/call-45");

    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.type(screen.getByLabelText("Имя"), "и".repeat(101));
    await user.type(screen.getByLabelText("Email"), "не-почта");
    await user.type(screen.getByLabelText("Комментарий"), "к".repeat(501));
    await user.click(screen.getByRole("button", { name: "Записаться" }));

    expect(screen.getAllByText(/длиннее 100 символов/)).not.toHaveLength(0);
    expect(
      screen.getAllByText(
        /Email гостя обязателен и должен быть корректным|корректн/,
      ),
    ).not.toHaveLength(0);
    expect(screen.getAllByText(/длиннее 500 символов/)).not.toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("требует обязательные поля без отправки", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/book/call-45");

    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.click(screen.getByRole("button", { name: "Записаться" }));

    expect(screen.getAllByText(/обязательн/)).not.toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("тема разговора: ошибка при пустом значении и при значении длиннее 100 символов, без отправки", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt("/book/call-45");

    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.type(await screen.findByLabelText("Имя"), "Мария Петрова");
    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: "Записаться" }));

    expect(screen.getAllByText(/Тема разговора обязательна/)).toHaveLength(1);
    expect(createMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Тема разговора"), "т".repeat(101));
    await user.click(screen.getByRole("button", { name: "Записаться" }));

    expect(
      screen.getAllByText(/Тема разговора не может быть длиннее 100 символов/),
    ).toHaveLength(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("успешная бронь открывает экран успеха с деталями встречи и путём к типам", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createMock.mockResolvedValue(SAMPLE_MEETING);
    renderAt("/book/call-45");

    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.type(
      await screen.findByLabelText("Тема разговора"),
      "Обсуждение проекта",
    );
    await user.type(await screen.findByLabelText("Имя"), "Мария Петрова");
    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.type(
      screen.getByLabelText("Комментарий"),
      "Хочу обсудить проект",
    );
    await user.click(screen.getByRole("button", { name: "Записаться" }));

    expect(createMock).toHaveBeenCalledWith({
      typeId: "call-45",
      startsAt: "2026-11-16T06:00:00.000Z",
      topic: "Обсуждение проекта",
      guestName: "Мария Петрова",
      guestEmail: "maria@example.com",
      comment: "Хочу обсудить проект",
    });
    expect(
      await screen.findByRole("heading", { name: "Вы записаны" }),
    ).toBeInTheDocument();
    // Дата и время в поясе владельца: 06:00 UTC = 09:00 по Europe/Moscow.
    expect(screen.getByText("Звонок на 45 минут")).toBeInTheDocument();
    expect(screen.getByText("16.11.2026, 09:00")).toBeInTheDocument();
    expect(screen.getByText("Обсуждение проекта")).toBeInTheDocument();
    expect(screen.getByText("Мария Петрова")).toBeInTheDocument();
    expect(screen.getByText("Хочу обсудить проект")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ко всем типам встреч" }),
    ).toHaveAttribute("href", "/");
    // Содержимое записи заменено экраном успеха.
    expect(screen.queryByLabelText("Имя")).toBeNull();
    expect(screen.queryByRole("button", { name: "09:00" })).toBeNull();
  });

  it("успешная бронь без комментария не отправляет поле", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createMock.mockResolvedValue({ ...SAMPLE_MEETING, comment: undefined });
    renderAt("/book/call-45");

    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.type(
      await screen.findByLabelText("Тема разговора"),
      "Обсуждение проекта",
    );
    await user.type(await screen.findByLabelText("Имя"), "Мария Петрова");
    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: "Записаться" }));

    expect(createMock).toHaveBeenCalledWith({
      typeId: "call-45",
      startsAt: "2026-11-16T06:00:00.000Z",
      topic: "Обсуждение проекта",
      guestName: "Мария Петрова",
      guestEmail: "maria@example.com",
    });
    expect(await screen.findByText("Вы записаны")).toBeInTheDocument();
    expect(screen.queryByText("Хочу обсудить проект")).toBeNull();
  });
});

describe("гонка брони", () => {
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "09:00" }));
    await user.type(
      await screen.findByLabelText("Тема разговора"),
      "Обсуждение проекта",
    );
    await user.type(await screen.findByLabelText("Имя"), "Мария Петрова");
    await user.type(screen.getByLabelText("Email"), "maria@example.com");
    await user.click(screen.getByRole("button", { name: "Записаться" }));
  }

  it("409 показывает сообщение API возле сетки слотов и перезагружает её: занятый слот исчезает", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // Перезагрузка сетки: слот 09:00 больше не свободен.
    slotsMock
      .mockResolvedValueOnce(SAMPLE_SLOTS)
      .mockResolvedValueOnce(SAMPLE_SLOTS.slice(1));
    createMock.mockRejectedValueOnce(new PublicApiError(409, "Слот уже занят"));
    renderAt("/book/call-45");

    await fillAndSubmit(user);

    expect(await screen.findByText("Слот уже занят")).toBeInTheDocument();
    // Перезагруженная сетка без занятого слота, форма закрыта.
    expect(
      await screen.findByRole("button", { name: "09:30" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "09:00" })).toBeNull();
    expect(screen.queryByLabelText("Имя")).toBeNull();
    expect(slotsMock).toHaveBeenCalledTimes(2);
  });

  it("404 брони показывает сообщение со ссылкой к типам", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createMock.mockRejectedValueOnce(
      new PublicApiError(404, "Тип встречи не найден"),
    );
    renderAt("/book/call-45");

    await fillAndSubmit(user);

    expect(
      await screen.findByText("Тип встречи не найден"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ко всем типам встреч" }),
    ).toHaveAttribute("href", "/");
    // Слот-сетка не перезагружается: тип исчез, а не слот занят.
    expect(slotsMock).toHaveBeenCalledTimes(1);
  });

  it("прочие ошибки брони показывают понятное сообщение и сохраняют выбор слота", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    createMock.mockRejectedValueOnce(new PublicApiError(0, "сеть недоступна"));
    renderAt("/book/call-45");

    await fillAndSubmit(user);

    expect(
      await screen.findByText("Не удалось выполнить бронирование"),
    ).toBeInTheDocument();
    // Сброс выбора и перезагрузка сетки - только при 409: выбор сохранён,
    // форма открыта, сетка не перезагружается.
    expect(screen.getByLabelText("Имя")).toBeInTheDocument();
    expect(slotsMock).toHaveBeenCalledTimes(1);
  });
});
