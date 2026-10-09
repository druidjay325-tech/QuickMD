import { it, expect, afterEach } from "vitest";
import {
  render,
  renderHook,
  waitFor,
  act,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import { mockIPC, mockWindows, clearMocks } from "@tauri-apps/api/mocks";
import FloatWindow from "../components/FloatWindow";
import { useToFloatSender } from "./useToFloatSender";
afterEach(async () => {
  cleanup();
  await act(async () => {
    await Promise.resolve();
  });
  clearMocks();
  delete (window as any).__QUICKMD_BROWSER__;
});
function fixture(failReplace = false) {
  let buffer = "Old float C";
  const archive: Array<{ name: string; content: string }> = [];
  const writes: string[] = [];
  mockWindows("float", "main");
  mockIPC(
    (command, args: any) => {
      switch (command) {
        case "get_settings":
          return { auto_save: true, autostart: false, shortcut: "Alt+Q" };
        case "inspect_buffer":
          return buffer;
        case "load_note":
          return args.filePath === "B.md" ? "Incoming B" : "Active A";
        case "save_buffer":
          writes.push(args.content);
          buffer = args.content;
          return;
        case "replace_buffer":
          if (failReplace) throw Error("disk full");
          archive.push({ name: args.oldTitle, content: buffer });
          buffer = args.content;
          return args.oldTitle;
        case "archive_buffer":
          archive.push({ name: args.title, content: buffer });
          buffer = "";
          return args.title;
        case "plugin:window|get_all_windows":
          return ["main", "float"];
        case "plugin:webview|get_all_webviews":
          return [
            { label: "main", windowLabel: "main" },
            { label: "float", windowLabel: "float" },
          ];
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  return { archive, writes, getBuffer: () => buffer };
}
it("右键 B 发送 B；浮窗立即保存与归档使用收到的正文", async () => {
  const data = fixture();
  const view = render(<FloatWindow />);
  await waitFor(() =>
    expect(view.container.querySelector("textarea")?.value).toBe("Old float C"),
  );
  const { result } = renderHook(() =>
    useToFloatSender({
      contentRef: { current: "Active A" },
      activeFileRef: { current: "A.md" },
      getCurrentFile: () => "A.md",
      saveNow: async () => {},
      onError: (s) => {
        throw Error(s);
      },
    }),
  );
  await act(async () => {
    await result.current.handleToFloat("B.md");
  });
  expect(view.container.querySelector("textarea")?.value).toBe("Incoming B");
  expect(data.getBuffer()).toBe("Incoming B");
  expect(data.archive[0].content).toBe("Old float C");
  await act(async () => {
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  });
  await waitFor(() =>
    expect(data.writes[data.writes.length - 1]).toBe("Incoming B"),
  );
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "归档" }));
  });
  await waitFor(() =>
    expect(view.container.querySelector("textarea")?.value).toBe(""),
  );
  expect(data.archive[data.archive.length - 1]?.content).toBe("Incoming B");
});
it("接收写入失败时保留浮窗旧稿并反馈失败", async () => {
  const data = fixture(true);
  const view = render(<FloatWindow />);
  await waitFor(() =>
    expect(view.container.querySelector("textarea")?.value).toBe("Old float C"),
  );
  let error = "";
  const { result } = renderHook(() =>
    useToFloatSender({
      contentRef: { current: "A" },
      activeFileRef: { current: "A.md" },
      getCurrentFile: () => "A.md",
      saveNow: async () => {},
      onError: (s) => (error = s),
    }),
  );
  await act(async () => {
    await result.current.handleToFloat("B.md");
  });
  expect(error).toContain("disk full");
  expect(data.getBuffer()).toBe("Old float C");
  expect(view.container.querySelector("textarea")?.value).toBe("Old float C");
});
