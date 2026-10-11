import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useImageInsert } from "./useImageInsert";
import { importImage } from "../commands";
import { open } from "@tauri-apps/plugin-dialog";
import type { CodeEditorHandle } from "../components/editor/CodeEditor";
const events = vi.hoisted(() => new Map<string, () => void>());
vi.mock("../commands", () => ({ importImage: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name, fn) => {
    events.set(name, fn);
    return () => events.delete(name);
  }),
}));
beforeEach(() => {
  vi.mocked(importImage).mockReset();
  vi.mocked(open).mockReset();
  events.clear();
});
afterEach(cleanup);
function fixture() {
  const state = {
    text: "before SELECT after",
    context: 1,
    preview: false,
    ready: true,
  };
  const editor: CodeEditorHandle = {
    getContent: () => state.text,
    setContent: vi.fn(),
    getScrollRatio: () => 0,
    setScrollRatio: vi.fn(),
    getSelection: () => ({ start: 7, end: 13, text: "SELECT" }),
    selectRange: vi.fn(),
    focus: vi.fn(),
    replaceSelection: vi.fn((text) => {
      state.text = state.text.slice(0, 7) + text + state.text.slice(13);
    }),
  };
  const editorRef = { current: editor as CodeEditorHandle | null };
  const toast = vi.fn();
  const view = renderHook(() =>
    useImageInsert({
      editorRef,
      getContext: () => state.context,
      canInsert: () => state.ready,
      isPreview: () => state.preview,
      toast,
    }),
  );
  return { ...view, state, editor, editorRef, toast };
}
function deferred() {
  let resolve!: (s: string) => void;
  const promise = new Promise<string>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
it("inserts an ordered image batch once at the captured selection and retains surrounding text", async () => {
  const f = fixture();
  vi.mocked(importImage)
    .mockResolvedValueOnce(".assets/a.png")
    .mockResolvedValueOnce(".assets/b.webp");
  await act(async () => {
    await f.result.current.insertImages(["C:/a.png", "C:/b.webp"]);
  });
  expect(vi.mocked(importImage).mock.calls.map((c) => c[0])).toEqual([
    "C:/a.png",
    "C:/b.webp",
  ]);
  expect(f.editor.selectRange).toHaveBeenCalledWith(7, 13);
  expect(f.editor.replaceSelection).toHaveBeenCalledTimes(1);
  expect(f.state.text).toBe(
    "before \n![图片](.assets/a.png)\n![图片](.assets/b.webp)\n after",
  );
});
it("inserts successful images but never writes a reference for a failed import", async () => {
  const f = fixture();
  vi.mocked(importImage)
    .mockRejectedValueOnce(Error("too large"))
    .mockResolvedValueOnce(".assets/b.gif");
  await act(async () => {
    await f.result.current.insertImages(["large.png", "b.gif"]);
  });
  expect(f.state.text).toContain(".assets/b.gif");
  expect(f.state.text).not.toContain("large.png");
  expect(f.toast).toHaveBeenCalledWith(expect.stringContaining("1"));
});
it.each(["session", "text", "directory", "preview", "busy", "editor"])(
  "cancels a pending batch when %s changes",
  async (reason) => {
    const f = fixture(),
      d = deferred();
    vi.mocked(importImage).mockReturnValueOnce(d.promise);
    let pending!: Promise<void>;
    await act(async () => {
      pending = f.result.current.insertImages(["a.png", "b.png"]);
    });
    if (reason === "session") f.state.context++;
    if (reason === "text") f.state.text = "newer text";
    if (reason === "directory") events.get("quickmd:directory-changed")!();
    if (reason === "preview") f.state.preview = true;
    if (reason === "busy") f.state.ready = false;
    if (reason === "editor") f.editorRef.current = null;
    await act(async () => {
      d.resolve(".assets/a.png");
      await pending;
    });
    expect(importImage).toHaveBeenCalledTimes(1);
    expect(f.editor.replaceSelection).not.toHaveBeenCalled();
    expect(f.toast).toHaveBeenCalledWith(expect.stringContaining("取消"));
  },
);
it("preview rejects drops without copying any image", async () => {
  const f = fixture();
  f.state.preview = true;
  await f.result.current.insertImages(["a.png"]);
  expect(importImage).not.toHaveBeenCalled();
  expect(f.toast).toHaveBeenCalledWith(expect.stringContaining("编辑"));
});
it("waits for an in-flight batch on close and rejects duplicate insertion", async () => {
  const f = fixture(),
    d = deferred();
  vi.mocked(importImage).mockReturnValueOnce(d.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = f.result.current.insertImages(["a.png"]);
  });
  let completed = false;
  const waiting = f.result.current.waitForImages().then(() => {
    completed = true;
  });
  await f.result.current.insertImages(["b.png"]);
  expect(completed).toBe(false);
  await act(async () => {
    d.resolve(".assets/a.png");
    await pending;
    await waiting;
  });
  expect(completed).toBe(true);
  expect(importImage).toHaveBeenCalledTimes(1);
});
it("captures the target before the picker opens", async () => {
  const f = fixture(),
    d = deferred();
  vi.mocked(open).mockReturnValue(d.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = f.result.current.chooseImages();
  });
  f.state.context++;
  await act(async () => {
    d.resolve("a.png");
    await pending;
  });
  expect(importImage).not.toHaveBeenCalled();
  expect(f.editor.replaceSelection).not.toHaveBeenCalled();
});
it("unmount cancels a pending insertion without writing or notifying another screen", async () => {
  const f = fixture(),
    d = deferred();
  vi.mocked(importImage).mockReturnValueOnce(d.promise);
  let pending!: Promise<void>;
  await act(async () => {
    pending = f.result.current.insertImages(["a.png"]);
  });
  f.unmount();
  d.resolve(".assets/a.png");
  await pending;
  expect(f.editor.replaceSelection).not.toHaveBeenCalled();
  expect(f.toast).not.toHaveBeenCalled();
});
