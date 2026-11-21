import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./AdminPage";
import {
  PanelApiError,
  createPanelMeetingType,
  deletePanelMeetingType,
  loadPanelMeetingTypes,
  loadPanelMeetings,
  updatePanelMeetingType,
} from "../data/panelApi";
import type { Meeting, MeetingType } from "../api";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../data/panelApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/panelApi")>();
  return {
    ...actual,
    loadPanelMeetingTypes: vi.fn(),
    loadPanelMeetings: vi.fn(),
    createPanelMeetingType: vi.fn(),
    updatePanelMeetingType: vi.fn(),
    deletePanelMeetingType: vi.fn(),
  };
});

const loadMock = vi.mocked(loadPanelMeetingTypes);
const loadMeetingsMock = vi.mocked(loadPanelMeetings);
const createMock = vi.mocked(createPanelMeetingType);
const updateMock = vi.mocked(updatePanelMeetingType);
const deleteMock = vi.mocked(deletePanelMeetingType);

const SAMPLE_TYPES: MeetingType[] = [
  {
    id: "intro-call",
    title: "Вводный звонок",
    description: "Знакомство и короткий разговор о задаче.",
    durationMinutes: 20,
    createdAt: "2026-11-12T14:00:00Z",
  },
  {
    id: "call-45",
    title: "Звонок на 45 минут",
    description: "Созвон для обсуждения проекта.",
    durationMinutes: 45,
    createdAt: "2026-11-10T09:00:00Z",
  },
];

function renderPage() {
  return renderWithProviders(<AdminPage />, "/admin");
}

function getItems() {
  return screen.getAllByRole("listitem");
}

function itemByTitle(title: string) {
  const items = getItems().filter((item) => within(item).queryByText(title));
  expect(items).toHaveLength(1);
  return items[0];
}

beforeEach(() => {
  loadMock.mockReset();
  createMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  loadMeetingsMock.mockReset();
  loadMock.mockResolvedValue([]);
  loadMeetingsMock.mockResolvedValue([]);
});

describe("панель владельца - список типов", () => {
  it("показывает типы из API: название, описание, длительность", async () => {
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    renderPage();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);

    const first = itemByTitle("Вводный звонок");
    expect(
      within(first).getByText("Знакомство и короткий разговор о задаче."),
    ).toBeInTheDocument();
    expect(within(first).getByText("20 минут")).toBeInTheDocument();

    const second = itemByTitle("Звонок на 45 минут");
    expect(
      within(second).getByText("Созвон для обсуждения проекта."),
    ).toBeInTheDocument();
    expect(within(second).getByText("45 минут")).toBeInTheDocument();
  });

  it("рендерит в порядке API - новые сверху", async () => {
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    renderPage();

    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Вводный звонок");
    expect(items[1]).toHaveTextContent("Звонок на 45 минут");
  });

  it("без типов показывает пустое состояние", async () => {
    renderPage();

    expect(
      await screen.findByText("Пока нет типов встреч"),
    ).toBeInTheDocument();
  });

  it("при ошибке загрузки предлагает повторить и загружает снова", async () => {
    const user = userEvent.setup();
    loadMock.mockRejectedValueOnce(new PanelApiError(0, "сеть недоступна"));
    loadMock.mockResolvedValueOnce(SAMPLE_TYPES);
    renderPage();

    expect(
      await screen.findByText("Не удалось загрузить типы встреч"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Вводный звонок")).toBeInTheDocument();
  });
});

const NEW_TYPE: MeetingType = {
  id: "new-id",
  title: "Новый звонок",
  description: "Разговор о новом проекте",
  durationMinutes: 30,
  createdAt: "2026-11-14T10:00:00Z",
};

describe("панель владельца - создание типа", () => {
  it("создаёт тип в модальном окне, тип появляется в списке сверху", async () => {
    const user = userEvent.setup();
    loadMock.mockResolvedValue([]);
    createMock.mockResolvedValue(NEW_TYPE);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Создать тип" }),
    );

    const modal = await screen.findByRole("dialog", {
      name: "Новый тип встречи",
    });
    await user.type(within(modal).getByLabelText("Название"), "Новый звонок");
    await user.type(
      within(modal).getByLabelText("Описание"),
      "Разговор о новом проекте",
    );
    await user.type(
      within(modal).getByLabelText("Длительность (минуты)"),
      "30",
    );
    await user.click(within(modal).getByRole("button", { name: "Сохранить" }));

    expect(createMock).toHaveBeenCalledWith({
      title: "Новый звонок",
      description: "Разговор о новом проекте",
      durationMinutes: 30,
    });
    expect(await screen.findByText("Новый звонок")).toBeInTheDocument();
    const items = getItems();
    expect(items[0]).toHaveTextContent("Новый звонок");
    expect(loadMock).toHaveBeenCalledTimes(1);
  });

  it("не отправляет форму с нарушениями валидации", async () => {
    const user = userEvent.setup();
    loadMock.mockResolvedValue([]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Создать тип" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "Новый тип встречи",
    });

    await user.type(within(modal).getByLabelText("Название"), "Н".repeat(101));
    await user.type(
      within(modal).getByLabelText("Описание"),
      "Разговор о новом проекте",
    );
    await user.type(within(modal).getByLabelText("Длительность (минуты)"), "3");
    await user.click(within(modal).getByRole("button", { name: "Сохранить" }));

    expect(within(modal).getAllByText(/длиннее 100 символов/)).not.toHaveLength(
      0,
    );
    expect(within(modal).getAllByText(/от 5 до 240 минут/)).not.toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("требует обязательные поля", async () => {
    const user = userEvent.setup();
    loadMock.mockResolvedValue([]);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Создать тип" }),
    );
    const modal = await screen.findByRole("dialog", {
      name: "Новый тип встречи",
    });

    await user.click(within(modal).getByRole("button", { name: "Сохранить" }));

    expect(within(modal).getAllByText(/Укажите/).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("панель владельца - изменение типа", () => {
  it("открывает модалку с данными типа и сохраняет изменения", async () => {
    const user = userEvent.setup();
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    updateMock.mockResolvedValue({
      ...SAMPLE_TYPES[0],
      title: "Переименованный звонок",
    });
    renderPage();
    await screen.findByText("Вводный звонок");

    const item = itemByTitle("Вводный звонок");
    await user.click(within(item).getByRole("button", { name: "Изменить" }));

    const modal = await screen.findByRole("dialog", {
      name: "Изменение типа встречи",
    });
    expect(within(modal).getByLabelText("Название")).toHaveValue(
      "Вводный звонок",
    );
    expect(within(modal).getByLabelText("Описание")).toHaveValue(
      "Знакомство и короткий разговор о задаче.",
    );

    const titleInput = within(modal).getByLabelText("Название");
    await user.clear(titleInput);
    await user.type(titleInput, "Переименованный звонок");
    await user.click(within(modal).getByRole("button", { name: "Сохранить" }));

    expect(updateMock).toHaveBeenCalledWith("intro-call", {
      title: "Переименованный звонок",
      description: "Знакомство и короткий разговор о задаче.",
      durationMinutes: 20,
    });
    expect(
      await screen.findByText("Переименованный звонок"),
    ).toBeInTheDocument();
  });
});

describe("панель владельца - удаление типа", () => {
  it("удаляет тип после подтверждения, тип исчезает из списка", async () => {
    const user = userEvent.setup();
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    deleteMock.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText("Вводный звонок");

    const item = itemByTitle("Вводный звонок");
    await user.click(within(item).getByRole("button", { name: "Удалить" }));

    const dialog = await screen.findByRole("dialog", {
      name: "Удалить тип встречи?",
    });
    expect(within(dialog).getByText(/Вводный звонок/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

    expect(deleteMock).toHaveBeenCalledWith("intro-call");
    expect(
      await screen.findByText("Созвон для обсуждения проекта."),
    ).toBeVisible();
    expect(screen.queryByText("Вводный звонок")).not.toBeInTheDocument();
  });

  it("отмена в подтверждении оставляет тип в списке", async () => {
    const user = userEvent.setup();
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    renderPage();
    await screen.findByText("Вводный звонок");

    const item = itemByTitle("Вводный звонок");
    await user.click(within(item).getByRole("button", { name: "Удалить" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Удалить тип встречи?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Отмена" }));

    expect(deleteMock).not.toHaveBeenCalled();
    expect(screen.getByText("Вводный звонок")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Удалить тип встречи?" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("при отказе API (409) показывает понятную ошибку, тип остаётся", async () => {
    const user = userEvent.setup();
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    deleteMock.mockRejectedValue(
      new PanelApiError(
        409,
        "Нельзя удалить тип встречи с предстоящими встречами",
      ),
    );
    renderPage();
    await screen.findByText("Вводный звонок");

    const item = itemByTitle("Вводный звонок");
    await user.click(within(item).getByRole("button", { name: "Удалить" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Удалить тип встречи?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

    expect(
      await screen.findByText(
        "Нельзя удалить тип встречи с предстоящими встречами",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Вводный звонок")).toBeInTheDocument();
  });
});

const SAMPLE_MEETINGS: Meeting[] = [
  {
    id: "meeting-1",
    typeId: "call-45",
    typeTitle: "Звонок на 45 минут",
    startsAt: "2026-11-18T09:00:00Z",
    guestName: "Мария Петрова",
    guestEmail: "maria@example.com",
    comment: "Хочу обсудить проект",
  },
  {
    id: "meeting-2",
    typeId: "intro-call",
    typeTitle: "Вводный звонок",
    startsAt: "2026-11-19T14:00:00Z",
    guestName: "Иван Смирнов",
    guestEmail: "ivan@example.com",
  },
];

describe("панель владельца - предстоящие встречи", () => {
  it("показывает встречи: название, гостя, комментарий, дату и время в поясе владельца", async () => {
    loadMeetingsMock.mockResolvedValue(SAMPLE_MEETINGS);
    renderPage();

    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);

    const first = itemByTitle("Звонок на 45 минут");
    expect(within(first).getByText("Мария Петрова")).toBeInTheDocument();
    expect(within(first).getByText("Хочу обсудить проект")).toBeInTheDocument();
    // 09:00 UTC = 12:00 в Europe/Moscow (ADR 0002).
    expect(within(first).getByText("18.11.2026, 12:00")).toBeInTheDocument();

    const second = itemByTitle("Вводный звонок");
    expect(within(second).getByText("Иван Смирнов")).toBeInTheDocument();
    // Без комментария лишнего текста нет.
    expect(within(second).queryByText(/обсудить/)).toBeNull();
  });

  it("рендерит встречи в порядке API - по возрастанию времени начала", async () => {
    loadMeetingsMock.mockResolvedValue(SAMPLE_MEETINGS);
    renderPage();

    const items = await screen.findAllByRole("listitem");

    expect(items[0]).toHaveTextContent("Звонок на 45 минут");
    expect(items[1]).toHaveTextContent("Вводный звонок");
  });

  it("без встреч показывает пустое состояние", async () => {
    renderPage();

    expect(await screen.findByText("Пока нет встреч")).toBeInTheDocument();
  });

  it("при ошибке загрузки предлагает повторить и загружает снова", async () => {
    const user = userEvent.setup();
    loadMeetingsMock.mockRejectedValueOnce(
      new PanelApiError(0, "сеть недоступна"),
    );
    loadMeetingsMock.mockResolvedValueOnce(SAMPLE_MEETINGS);
    renderPage();

    expect(
      await screen.findByText("Не удалось загрузить встречи"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Мария Петрова")).toBeInTheDocument();
  });
});
