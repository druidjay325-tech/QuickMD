import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsModal from "./SettingsModal";
import {
  getSettings,
  getFlashthoughtsDirPath,
  saveAppSettings,
} from "../../commands";

vi.mock("../../commands", () => ({
  getSettings: vi.fn(),
  getFlashthoughtsDirPath: vi.fn(),
  saveAppSettings: vi.fn(),
  setCustomDir: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ glassOpacity: 22, setGlassOpacity: vi.fn() }),
}));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSettings).mockResolvedValue({
    shortcut: "Alt+Q",
    autostart: false,
    auto_save: true,
    custom_dir: null,
  });
  vi.mocked(getFlashthoughtsDirPath).mockResolvedValue("isolated-notes");
  vi.mocked(saveAppSettings).mockResolvedValue(undefined);
});
afterEach(cleanup);

it("加载设置不触发保存，面板没有保存按钮和底部横栏", async () => {
  const view = render(<SettingsModal onClose={vi.fn()} />);
  await waitFor(() =>
    expect(
      screen
        .getByRole("checkbox", { name: "自动保存" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  expect(saveAppSettings).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
  expect(view.container.querySelector(".settings-footer")).toBeNull();
});

it("快速连续调整串行保存最终完整设置，关闭等待落盘", async () => {
  const first = deferred();
  const last = deferred();
  vi.mocked(saveAppSettings)
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(() => last.promise);
  const closed = vi.fn();
  const user = userEvent.setup();
  render(<SettingsModal onClose={closed} />);
  await waitFor(() =>
    expect(
      screen
        .getByRole("checkbox", { name: "自动保存" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("checkbox", { name: "自动保存" }));
  await waitFor(() =>
    expect(saveAppSettings).toHaveBeenCalledWith(false, "Alt+Q", false),
  );
  await user.selectOptions(screen.getByLabelText("快捷键首修饰键"), "Ctrl");
  await user.click(screen.getByRole("checkbox", { name: "开机自启动" }));
  await user.click(screen.getByRole("button", { name: "关闭" }));
  await user.click(screen.getByRole("checkbox", { name: "自动保存" }));
  expect(saveAppSettings).toHaveBeenCalledTimes(1);
  expect(closed).not.toHaveBeenCalled();
  await act(async () => first.resolve());
  await waitFor(() =>
    expect(saveAppSettings).toHaveBeenLastCalledWith(true, "Ctrl+Q", true),
  );
  expect(closed).not.toHaveBeenCalled();
  await act(async () => last.resolve());
  await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
  expect(saveAppSettings).toHaveBeenCalledTimes(2);
  expect(saveAppSettings).toHaveBeenLastCalledWith(true, "Ctrl+Q", true);
});

it("关闭期间保存失败会保留错误和面板，并恢复已保存选项", async () => {
  const first = deferred();
  vi.mocked(saveAppSettings).mockImplementationOnce(() => first.promise);
  const closed = vi.fn();
  const user = userEvent.setup();
  render(<SettingsModal onClose={closed} />);
  await waitFor(() =>
    expect(
      screen
        .getByRole("checkbox", { name: "自动保存" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("checkbox", { name: "自动保存" }));
  await user.click(screen.getByRole("button", { name: "关闭" }));
  await act(async () => first.reject(new Error("disk full")));
  expect((await screen.findByRole("alert")).textContent).toContain("disk full");
  expect(
    (screen.getByRole("checkbox", { name: "自动保存" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(closed).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "关闭" }));
  await waitFor(() => expect(closed).toHaveBeenCalledTimes(1));
});
