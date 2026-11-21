import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useLoad } from "./useLoad";

describe("хук загрузки useLoad", () => {
  it("загружает данные: loading, затем ready с данными", async () => {
    const { result } = renderHook(() =>
      useLoad(async () => ["первый"], [] as string[]),
    );

    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual(["первый"]);
  });

  it("отказ загрузки переводит в error", async () => {
    const { result } = renderHook(() =>
      useLoad(async () => {
        throw new Error("сеть недоступна");
      }, [] as string[]),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("reload повторяет загрузку и сбрасывает статус в loading", async () => {
    let call = 0;
    const { result } = renderHook(() =>
      useLoad(async () => {
        call += 1;
        return `данные ${call}`;
      }, "начало"),
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toBe("данные 1");

    act(() => result.current.reload());
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toBe("данные 2");
  });
});
