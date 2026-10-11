import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearMocks,
  mockConvertFileSrc,
  mockIPC,
  mockWindows,
} from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import MainWindow from "../components/MainWindow";
import FloatWindow from "../components/FloatWindow";
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    value: vi.fn((_command, _ui, text) => {
      const editor = document.activeElement as HTMLTextAreaElement;
      editor.setRangeText(
        text,
        editor.selectionStart,
        editor.selectionEnd,
        "end",
      );
      return true;
    }),
  });
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    await Promise.resolve();
  });
  clearMocks();
});
function fixture(label: string, imageResult?: Promise<string>) {
  let buffer = "before SELECT after";
  const imported: string[] = [];
  const archived: string[] = [];
  mockWindows(label, "main", "float");
  mockConvertFileSrc("windows");
  mockIPC(
    (command, args: any) => {
      switch (command) {
        case "get_settings":
          return { auto_save: false, autostart: false, shortcut: "Alt+Q" };
        case "inspect_buffer":
          return buffer;
        case "list_notes":
          return [];
        case "get_all_tags":
          return {};
        case "import_image":
          imported.push(args.path);
          return imageResult || `.assets/image-${imported.length}.png`;
        case "resolve_image":
          return "C:/isolated/image.png";
        case "save_buffer":
          buffer = args.content;
          return;
        case "archive_buffer":
          archived.push(buffer);
          buffer = "";
          return args.title;
        case "plugin:window|get_all_windows":
          return ["main", "float"];
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
  return { imported, archived, getBuffer: () => buffer };
}
async function drop(paths: string[]) {
  await act(async () => {
    await emit("tauri://drag-drop", { paths, position: { x: 10, y: 10 } });
  });
}
it("the main Split view routes native drop events into the existing note and local preview", async () => {
  const data = fixture("main"),
    view = render(<MainWindow />);
  await act(async () => {
    await Promise.resolve();
  });
  const editor = view.container.querySelector("textarea")!;
  fireEvent.change(editor, { target: { value: "before SELECT after" } });
  editor.setSelectionRange(7, 13);
  await drop(["C:/photo [一] (1).PNG", "C:/second.webp"]);
  await waitFor(() => expect(editor.value).toContain(".assets/image-2.png"));
  expect(editor.value).toBe(
    "before \n![图片](.assets/image-1.png)\n![图片](.assets/image-2.png)\n after",
  );
  expect(data.imported).toHaveLength(2);
  await waitFor(() =>
    expect(view.container.querySelectorAll(".preview-pane img")).toHaveLength(
      2,
    ),
  );
  fireEvent.click(view.getByRole("button", { name: "预览" }));
  await drop(["C:/blocked.png"]);
  expect(data.imported).toHaveLength(2);
  expect(view.getByText("请先切换到编辑或分屏，再插入图片。")).toBeTruthy();
});
it("the scratchpad inserts rather than replacing its draft, then saves and archives the references", async () => {
  localStorage.setItem("quickmd-buffer-title", "Image fixture");
  localStorage.setItem("quickmd-buffer-title-kind", "custom");
  const data = fixture("float"),
    view = render(<FloatWindow />);
  await waitFor(() =>
    expect(view.container.querySelector("textarea")?.value).toBe(
      "before SELECT after",
    ),
  );
  view.container.querySelector("textarea")!.setSelectionRange(7, 13);
  await drop(["C:/photo.png"]);
  await waitFor(() =>
    expect(view.container.querySelector("textarea")?.value).toContain(
      ".assets/image-1.png",
    ),
  );
  expect(data.archived).toHaveLength(0);
  await act(async () => {
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
  });
  await waitFor(() =>
    expect(data.getBuffer()).toBe(
      "before \n![图片](.assets/image-1.png)\n after",
    ),
  );
  fireEvent.click(view.getByRole("button", { name: "归档" }));
  await waitFor(() =>
    expect(data.archived).toEqual([
      "before \n![图片](.assets/image-1.png)\n after",
    ]),
  );
});
it("archiving during image copying waits and includes the resulting reference", async () => {
  localStorage.setItem("quickmd-buffer-title", "Image fixture");
  let resolve!: (path: string) => void;
  const pending = new Promise<string>((r) => {
    resolve = r;
  });
  const data = fixture("float", pending),
    view = render(<FloatWindow />);
  await waitFor(() =>
    expect(view.container.querySelector("textarea")?.value).toBe(
      "before SELECT after",
    ),
  );
  await drop(["C:/pending.png"]);
  fireEvent.click(view.getByRole("button", { name: "归档" }));
  expect(data.archived).toEqual([]);
  await act(async () => {
    resolve(".assets/pending.png");
  });
  await waitFor(() =>
    expect(data.archived[0]).toContain("![图片](.assets/pending.png)"),
  );
});
