import { it, expect, vi, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useAutoSave } from "./useAutoSave";
import { saveNote } from "../commands";
vi.mock("../commands", () => ({
  saveNote: vi.fn(),
  saveBuffer: vi.fn(),
  createNote: vi.fn().mockResolvedValue("new.md"),
}));
afterEach(cleanup);
it("保存失败不成为成功 Promise，当前稿仍为 dirty", async () => {
  vi.mocked(saveNote).mockRejectedValueOnce(Error("disk full"));
  let text = "before";
  const { result } = renderHook(() =>
    useAutoSave({ getContent: () => text, autoSaveEnabled: false }),
  );
  act(() => result.current.setCurrentFile("a.md", text));
  text = "after";
  act(() => result.current.scheduleSave());
  await act(async () => {
    await expect(result.current.saveNow()).rejects.toThrow("disk full");
  });
  expect(result.current.saveStatus).toBe("error");
  expect(result.current.isDirty()).toBe(true);
  expect(text).toBe("after");
});
it("旧版本保存完成不能把新增编辑标为 saved", async () => {
  let finish!: () => void;
  vi.mocked(saveNote).mockImplementationOnce(
    () => new Promise<void>((r) => (finish = r)),
  );
  let text = "old";
  const { result } = renderHook(() =>
    useAutoSave({ getContent: () => text, autoSaveEnabled: false }),
  );
  act(() => result.current.setCurrentFile("a.md", text));
  text = "first";
  let pending!: Promise<void>;
  act(() => {
    result.current.scheduleSave();
    pending = result.current.saveNow();
  });
  await act(async () => {
    await Promise.resolve();
  });
  text = "second";
  act(() => result.current.scheduleSave());
  await act(async () => {
    finish();
    await pending;
  });
  expect(result.current.saveStatus).toBe("unsaved");
  expect(result.current.isDirty()).toBe(true);
});
