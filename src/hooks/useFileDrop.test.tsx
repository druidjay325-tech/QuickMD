import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFileDrop } from "./useFileDrop";
import { readFileAbsolute } from "../commands";
const native = vi.hoisted(() => ({
  handler: null as null | ((event: any) => void),
  unlisten: vi.fn(),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: async (fn: any) => {
      native.handler = fn;
      return native.unlisten;
    },
  }),
}));
vi.mock("../commands", () => ({ readFileAbsolute: vi.fn() }));
beforeEach(() => {
  vi.mocked(readFileAbsolute).mockReset();
  native.handler = null;
  native.unlisten.mockClear();
});
afterEach(cleanup);
function fixture() {
  const callbacks = {
    onFileDrop: vi.fn(),
    onImageDrop: vi.fn(),
    onUnsupportedFile: vi.fn(),
    onError: vi.fn(),
  };
  const view = renderHook(() => useFileDrop(callbacks));
  return { ...view, ...callbacks };
}
async function drop(paths: string[]) {
  await act(async () => {
    native.handler!({ payload: { type: "drop", paths } });
  });
}
it("routes all supported image formats in native order without treating bytes as text", async () => {
  const f = fixture();
  const paths = ["a.PNG", "b.JPEG", "c.jpg", "d.gif", "e.webp"];
  await drop(paths);
  expect(f.onImageDrop).toHaveBeenCalledWith(paths);
  expect(readFileAbsolute).not.toHaveBeenCalled();
  expect(f.onFileDrop).not.toHaveBeenCalled();
});
it("keeps the existing Markdown and text import path", async () => {
  const f = fixture();
  vi.mocked(readFileAbsolute).mockResolvedValue("# imported");
  await drop(["C:/original.TXT"]);
  expect(f.onFileDrop).toHaveBeenCalledWith("# imported", "original.TXT");
  expect(f.onImageDrop).not.toHaveBeenCalled();
});
it.each([["a.png", "b.md"], ["a.png", "b.exe"], ["a.bmp"]])(
  "rejects mixed or unsupported batches without importing anything: %j",
  async (...paths) => {
    const f = fixture();
    await drop(paths);
    expect(f.onUnsupportedFile).toHaveBeenCalled();
    expect(readFileAbsolute).not.toHaveBeenCalled();
    expect(f.onImageDrop).not.toHaveBeenCalled();
  },
);
it("ignores native drops after unmount", async () => {
  const f = fixture();
  f.unmount();
  await drop(["a.png"]);
  expect(f.onImageDrop).not.toHaveBeenCalled();
  expect(native.unlisten).toHaveBeenCalled();
});
