import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "./useTheme";
import { setWindowGlass } from "../commands";
vi.mock("../commands", () => ({
  setWindowGlass: vi.fn(),
  getWindowMaterial: vi.fn().mockResolvedValue(null),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(setWindowGlass).mockImplementation(
    async (enabled, _dark, opacity) => ({
      engine: enabled ? "DesktopAcrylicController" : "solid",
      enabled,
      opacity,
      tintOpacity: enabled ? opacity / 100 : null,
      luminosityOpacity: enabled ? opacity / 100 : null,
      state: enabled ? 0 : null,
      tintColor: enabled ? [25, 38, 60] : null,
    }),
  );
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.nativeGlass;
});
it("滑块通过原生请求更新双层材质，回读成功才启用无重复底色的原生样式", async () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
  await waitFor(() =>
    expect(setWindowGlass).toHaveBeenCalledWith(true, true, 22, "#527ac7"),
  );
  await act(async () => result.current.setGlassOpacity(75));
  await waitFor(() =>
    expect(result.current.materialStatus?.luminosityOpacity).toBe(0.75),
  );
  expect(result.current.materialStatus?.tintOpacity).toBe(0.75);
  expect(setWindowGlass).toHaveBeenLastCalledWith(true, true, 75, "#527ac7");
  expect(document.documentElement.dataset.nativeGlass).toBe("true");
});
it("退出毛玻璃会请求关闭控制器，失败显示原因且不宣称原生材质已启用", async () => {
  const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
  await waitFor(() =>
    expect(result.current.materialStatus?.enabled).toBe(true),
  );
  await act(async () => result.current.setTheme("light"));
  await waitFor(() =>
    expect(setWindowGlass).toHaveBeenLastCalledWith(
      false,
      false,
      22,
      "#527ac7",
    ),
  );
  await waitFor(() =>
    expect(document.documentElement.dataset.nativeGlass).toBe("false"),
  );
  vi.mocked(setWindowGlass).mockRejectedValueOnce(
    new Error("runtime unavailable"),
  );
  await act(async () => result.current.setTheme("glass"));
  await waitFor(() =>
    expect(result.current.materialError).toContain("runtime unavailable"),
  );
  expect(document.documentElement.dataset.nativeGlass).toBe("false");
});
