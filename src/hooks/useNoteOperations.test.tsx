import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useNoteOperations } from "./useNoteOperations";
import { deleteNote } from "../commands";
import { openConfirmDialog } from "../components/ConfirmDialog";
vi.mock("../commands", () => ({
  loadNote: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  renameNote: vi.fn(),
  exportNote: vi.fn(),
  openInExplorer: vi.fn(),
}));
vi.mock("../components/ConfirmDialog", () => ({ openConfirmDialog: vi.fn() }));
function fixture() {
  const order: string[] = [];
  const activeFileRef = { current: "A.md" as string | null };
  const contentRef = { current: "latest edited text" };
  const saveNow = vi.fn(async () => {
    order.push("save");
  });
  const setCurrentFile = vi.fn();
  const refreshNotes = vi.fn(async () => {
    order.push("refresh");
  });
  const view = renderHook(() =>
    useNoteOperations({
      saveNow,
      saveStatusRef: { current: "unsaved" },
      activeFileRef,
      contentRef,
      isDirty: () => true,
      waitForIdle: async () => {
        order.push("idle");
      },
      setCurrentFile,
      setContent: vi.fn(),
      setMarkdownSignal: vi.fn(),
      isLoadingRef: { current: false },
      lastUserFileRef: { current: "A.md" },
      refreshNotes,
    }),
  );
  return {
    ...view,
    order,
    activeFileRef,
    contentRef,
    saveNow,
    setCurrentFile,
    refreshNotes,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteNote).mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("删除活动便利贴先保存最新正文，再移入系统回收站并清空会话", async () => {
  const view = fixture();
  vi.mocked(deleteNote).mockImplementation(async (name) => {
    view.order.push(`delete:${name}`);
  });
  await act(async () => view.result.current.handleDelete("A.md"));
  expect(view.order).toEqual(["idle", "save", "delete:A.md", "refresh"]);
  expect(openConfirmDialog).not.toHaveBeenCalled();
  expect(view.activeFileRef.current).toBeNull();
  expect(view.setCurrentFile).toHaveBeenCalledWith(null, "");
});
it("右键删除 B 时保留活动 A 的内容，不误删或改写 A", async () => {
  const view = fixture();
  await act(async () => view.result.current.handleDelete("B.md"));
  expect(deleteNote).toHaveBeenCalledWith("B.md");
  expect(view.saveNow).not.toHaveBeenCalled();
  expect(view.activeFileRef.current).toBe("A.md");
  expect(view.contentRef.current).toBe("latest edited text");
  expect(view.setCurrentFile).not.toHaveBeenCalled();
});
it("当前正文保存失败时阻止删除并保留会话", async () => {
  const view = fixture();
  view.saveNow.mockRejectedValueOnce(new Error("disk full"));
  await act(async () => view.result.current.handleDelete("A.md"));
  expect(deleteNote).not.toHaveBeenCalled();
  expect(view.activeFileRef.current).toBe("A.md");
  expect(view.result.current.toastMsg).toContain("disk full");
});
it("系统回收站失败时不清空正文或假装刷新成功", async () => {
  const view = fixture();
  vi.mocked(deleteNote).mockRejectedValueOnce(new Error("recycle unavailable"));
  await act(async () => view.result.current.handleDelete("A.md"));
  expect(view.activeFileRef.current).toBe("A.md");
  expect(view.setCurrentFile).not.toHaveBeenCalled();
  expect(view.refreshNotes).not.toHaveBeenCalled();
  expect(view.result.current.toastMsg).toContain("recycle unavailable");
});
