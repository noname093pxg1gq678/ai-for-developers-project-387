import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { loadMeetingTypes } from "./data/publicApi";
import type { MeetingType } from "./api";

vi.mock("./data/publicApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./data/publicApi")>();
  return { ...actual, loadMeetingTypes: vi.fn() };
});

const loadMock = vi.mocked(loadMeetingTypes);

const SAMPLE_TYPES: MeetingType[] = [
  {
    id: "call-45",
    title: "Звонок на 45 минут",
    description: "Созвон для обсуждения проекта.",
    durationMinutes: 45,
    createdAt: "2026-11-10T09:00:00Z",
  },
];

beforeEach(() => {
  window.history.pushState({}, "", "/");
  loadMock.mockReset();
  loadMock.mockResolvedValue(SAMPLE_TYPES);
});

describe("маршруты приложения", () => {
  it("показывает публичную страницу в корне", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Алексей Иванов" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Звонок на 45 минут/ }),
    ).toBeInTheDocument();
  });

  it("показывает заглушку панели владельца на /admin", () => {
    window.history.pushState({}, "", "/admin");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Панель владельца" }),
    ).toBeInTheDocument();
  });

  it("показывает страницу 404 для неизвестного маршрута", () => {
    window.history.pushState({}, "", "/somewhere/unknown");
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Страница не найдена" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ко всем типам встреч" }),
    ).toHaveAttribute("href", "/");
  });

  it("карточка типа ведёт на страницу записи", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("link", { name: /Звонок на 45 минут/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Запись на встречу" }),
    ).toBeInTheDocument();
  });
});
