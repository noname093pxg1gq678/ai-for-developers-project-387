import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicPage from "./PublicPage";
import { loadMeetingTypes } from "../data/publicApi";
import type { MeetingType } from "../api";
import { renderWithProviders } from "../test/renderWithProviders";

vi.mock("../data/publicApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../data/publicApi")>();
  return { ...actual, loadMeetingTypes: vi.fn() };
});

const loadMock = vi.mocked(loadMeetingTypes);

const SAMPLE_TYPES: MeetingType[] = [
  {
    id: "call-45",
    title: "Звонок на 45 минут",
    description: "Созвон для обсуждения проекта. Подготовьте вопросы заранее.",
    durationMinutes: 45,
    createdAt: "2026-11-10T09:00:00Z",
  },
  {
    id: "intro-call",
    title: "Вводный звонок",
    description: "Знакомство и короткий разговор о задаче.",
    durationMinutes: 20,
    createdAt: "2026-11-12T14:00:00Z",
  },
];

function renderPage() {
  return renderWithProviders(<PublicPage />);
}

beforeEach(() => {
  loadMock.mockReset();
});

describe("публичная страница", () => {
  it("показывает имя владельца заголовком и меняет title документа", async () => {
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    renderPage();

    expect(
      screen.getByRole("heading", { name: "Алексей Иванов" }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Алексей Иванов - запись на встречу");
  });

  it("показывает карточки типов с описанием и длительностью", async () => {
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    renderPage();

    expect(
      await screen.findByText(
        "Созвон для обсуждения проекта. Подготовьте вопросы заранее.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("20 минут")).toBeInTheDocument();
    expect(screen.getByText("45 минут")).toBeInTheDocument();
  });

  it("карточка типа ведёт на страницу записи этого типа", async () => {
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    renderPage();

    const link = await screen.findByRole("link", {
      name: /Звонок на 45 минут/,
    });

    expect(link).toHaveAttribute("href", "/book/call-45");
  });

  it("рендерит типы в порядке источника данных, не пересортировывая", async () => {
    loadMock.mockResolvedValue(SAMPLE_TYPES);
    renderPage();

    const links = await screen.findAllByRole("link");

    expect(links[0]).toHaveTextContent(SAMPLE_TYPES[0].title);
    expect(links[1]).toHaveTextContent(SAMPLE_TYPES[1].title);
  });

  it("без типов показывает пустое состояние", async () => {
    loadMock.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByText("Пока нет доступных типов встреч"),
    ).toBeInTheDocument();
  });

  it("во время загрузки не показывает ни список, ни состояния", () => {
    loadMock.mockImplementation(() => new Promise<MeetingType[]>(() => {}));
    renderPage();

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText("Пока нет доступных типов встреч")).toBeNull();
    expect(screen.queryByText("Не удалось загрузить типы встреч")).toBeNull();
  });

  it("при ошибке загрузки предлагает повторить и загружает снова", async () => {
    const user = userEvent.setup();
    loadMock.mockRejectedValueOnce(new Error("сеть недоступна"));
    loadMock.mockResolvedValueOnce(SAMPLE_TYPES);
    renderPage();

    expect(
      await screen.findByText("Не удалось загрузить типы встреч"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Повторить" }));

    expect(
      await screen.findByRole("link", { name: /Вводный звонок/ }),
    ).toBeInTheDocument();
  });
});
