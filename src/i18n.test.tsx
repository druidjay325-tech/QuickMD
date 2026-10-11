import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import i18n, {
  applyLocale,
  initializeLocale,
  tr,
  useLocale,
  displayMessage,
} from "./i18n";
import SettingsModal from "./components/editor/SettingsModal";
import { AppError, normalizeError } from "./errors";
import type { LocaleState } from "./commands";
const native = vi.hoisted(() => ({
  revision: 100,
  state: { preference: "zh-CN", locale: "zh-CN", revision: 100 } as LocaleState,
  listener: null as null | ((event: { payload: LocaleState }) => void),
  mounts: 0,
  fail: false,
}));
vi.mock("./commands", () => ({
  getLocaleState: vi.fn(async () => native.state),
  saveLocale: vi.fn(async (preference: LocaleState["preference"]) => {
    if (native.fail) throw new AppError("errors.system", "disk full");
    native.state = {
      preference,
      locale: preference === "zh-CN" ? "zh-CN" : "en",
      revision: ++native.revision,
    };
    native.listener?.({ payload: native.state });
    return native.state;
  }),
  getSettings: vi.fn(async () => ({
    shortcut: "Alt+Q",
    autostart: false,
    auto_save: true,
  })),
  saveAppSettings: vi.fn(async () => {}),
  getFlashthoughtsDirPath: vi.fn(async () => "C:/isolated/flashthoughts"),
  setCustomDir: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, callback: typeof native.listener) => {
    if (name === "quickmd:locale-changed") native.listener = callback;
    return () => {};
  }),
  emit: vi.fn(async () => {}),
}));
vi.mock("./hooks/useTheme", () => ({
  useTheme: () => ({
    glassOpacity: 22,
    setGlassOpacity: vi.fn(),
    materialError: null,
  }),
}));
beforeEach(async () => {
  native.fail = false;
  native.mounts = 0;
  native.state = {
    preference: "zh-CN",
    locale: "zh-CN",
    revision: ++native.revision,
  };
  await initializeLocale();
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("zh-CN");
});
function EditorFixture() {
  useLocale();
  const [text, setText] = useState("用户原文 / original content");
  useEffect(() => {
    native.mounts++;
  }, []);
  return (
    <>
      <label>
        {tr("ui.edit")}
        <textarea
          aria-label="draft"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <SettingsModal onClose={() => {}} />
    </>
  );
}
it("changes language through Settings without remounting or changing the draft", async () => {
  render(<EditorFixture />);
  const field = screen.getByRole("textbox", { name: "draft" });
  fireEvent.change(field, {
    target: { value: "未保存 / unsaved **content**" },
  });
  fireEvent.change(screen.getByLabelText("界面语言"), {
    target: { value: "en" },
  });
  await screen.findByLabelText("Language");
  expect(screen.getByRole("textbox", { name: "draft" })).toBe(field);
  expect((field as HTMLTextAreaElement).value).toBe(
    "未保存 / unsaved **content**",
  );
  expect(native.mounts).toBe(1);
  expect(document.documentElement.lang).toBe("en");
  expect(tr("stats.count", { count: 1 })).toBe("1 unit");
  expect(tr("stats.count", { count: 2 })).toBe("2 units");
});
it("receives another window's change and rejects an older event", async () => {
  render(<EditorFixture />);
  const latest = {
    preference: "en",
    locale: "en",
    revision: ++native.revision,
  } as LocaleState;
  await act(async () => {
    native.listener?.({ payload: latest });
  });
  expect(screen.getByLabelText("Language")).toBeTruthy();
  await act(async () => {
    await applyLocale({
      ...latest,
      locale: "zh-CN",
      revision: latest.revision - 1,
    });
  });
  expect(screen.getByLabelText("Language")).toBeTruthy();
});
it("retains the confirmed language when persistence fails", async () => {
  native.fail = true;
  render(<EditorFixture />);
  fireEvent.change(screen.getByLabelText("界面语言"), {
    target: { value: "en" },
  });
  await waitFor(() => expect(screen.getByText(/disk full/)).toBeTruthy());
  expect(screen.getByLabelText("界面语言")).toBeTruthy();
  expect(document.documentElement.lang).toBe("zh-CN");
});
it("localizes stable native errors and an already visible error after switching", async () => {
  const error = normalizeError({ code: "errors.notFound", detail: null });
  const chinese = String(error);
  await applyLocale({
    preference: "en",
    locale: "en",
    revision: ++native.revision,
  });
  expect(String(error)).toBe("The note was not found");
  expect(displayMessage(chinese)).toBe("The note was not found");
});
