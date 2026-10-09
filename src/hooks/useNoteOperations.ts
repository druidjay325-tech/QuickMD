import { useCallback, useRef, useState } from "react";
import {
  loadNote,
  createNote as createStoredNote,
  deleteNote,
  renameNote,
  exportNote,
  openInExplorer,
} from "../commands";
import { openInputModal } from "../components/InputModal";
import { openConfirmDialog } from "../components/ConfirmDialog";
interface Options {
  saveNow: () => Promise<void>;
  saveStatusRef: React.MutableRefObject<string>;
  activeFileRef: React.MutableRefObject<string | null>;
  contentRef: React.MutableRefObject<string>;
  isDirty: () => boolean;
  waitForIdle: () => Promise<void>;
  setCurrentFile: (name: string | null, text?: string) => void;
  setContent: (text: string) => void;
  setMarkdownSignal: (text: string) => void;
  isLoadingRef: React.MutableRefObject<boolean>;
  lastUserFileRef: React.MutableRefObject<string | null>;
  refreshNotes: () => Promise<void>;
}
export function useNoteOperations(o: Options) {
  const [toastMsg, setToastMsg] = useState(""),
    [toastKey, setToastKey] = useState(0);
  const busy = useRef(false);
  const [operationBusy, setOperationBusy] = useState(false);
  const waiters = useRef<Array<() => void>>([]);
  const waitForOperation = () =>
    busy.current
      ? new Promise<void>((resolve) => waiters.current.push(resolve))
      : Promise.resolve();
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastKey((k) => k + 1);
  }, []);
  const run = async (task: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setOperationBusy(true);
    try {
      await task();
    } catch (e) {
      toast(String(e));
    } finally {
      busy.current = false;
      setOperationBusy(false);
      waiters.current.forEach((resolve) => resolve());
      waiters.current = [];
    }
  };
  const prepareToLeave = async () => {
    await o.waitForIdle();
    if (!o.isDirty()) return true;
    const result = await openConfirmDialog({
      title: "保留当前更改？",
      message: "保存后再继续，或明确放弃本次更改。",
      buttons: [
        { text: "保存", value: "save", primary: true },
        { text: "放弃更改", value: "discard" },
        { text: "取消", value: "cancel" },
      ],
    });
    if (result !== "save" && result !== "discard") return false;
    if (result === "save") await o.saveNow();
    return true;
  };
  const apply = (name: string | null, text: string) => {
    o.activeFileRef.current = name;
    o.setCurrentFile(name, text);
    o.isLoadingRef.current = true;
    o.setContent(text);
    o.setMarkdownSignal(text);
    o.isLoadingRef.current = false;
    o.lastUserFileRef.current = name;
  };
  const openNote = async (name: string) =>
    run(async () => {
      if (!(await prepareToLeave())) return;
      const previous = o.contentRef.current;
      const file = o.activeFileRef.current;
      const text = await loadNote(name);
      if (
        previous !== o.contentRef.current ||
        file !== o.activeFileRef.current
      ) {
        toast("读取期间有新的编辑，当前内容已保留，请再次打开");
        return;
      }
      apply(name, text);
    });
  const createNote = async () =>
    run(async () => {
      const name = await openInputModal({
        title: "新建便利贴",
        label: "名称",
        placeholder: "给想法起一个名字",
      });
      if (!name || !(await prepareToLeave())) return;
      const created = await createStoredNote(
        name.endsWith(".md") ? name : `${name}.md`,
      );
      apply(created, "");
      await o.refreshNotes();
    });
  const importNote = async (text: string, name: string) =>
    run(async () => {
      if (!(await prepareToLeave())) return;
      const created = await createStoredNote(
        name.replace(/\.(md|txt)$/i, "") + ".md",
        text,
      );
      apply(created, text);
      await o.refreshNotes();
    });
  const textFor = async (name: string) =>
    name === o.activeFileRef.current
      ? o.contentRef.current
      : await loadNote(name);
  const updatePins = (old: string, newName?: string) => {
    try {
      const pins: string[] = JSON.parse(
        localStorage.getItem("quickmd-pinned") || "[]",
      );
      localStorage.setItem(
        "quickmd-pinned",
        JSON.stringify(
          pins.flatMap((n) => (n === old ? (newName ? [newName] : []) : [n])),
        ),
      );
      window.dispatchEvent(new Event("quickmd:pins-updated"));
    } catch {}
  };
  const handleRename = async (name: string) =>
    run(async () => {
      const value = await openInputModal({
        title: "重命名便利贴",
        label: "新名称",
        defaultValue: name.replace(/\.md$/, ""),
      });
      if (!value) return;
      await o.waitForIdle();
      if (name === o.activeFileRef.current) await o.saveNow();
      const next = value.endsWith(".md") ? value : `${value}.md`;
      await renameNote(name, next);
      updatePins(name, next);
      if (name === o.activeFileRef.current) {
        o.activeFileRef.current = next;
        o.setCurrentFile(next, o.contentRef.current);
      }
      await o.refreshNotes();
    });
  const handleDelete = async (name: string) =>
    run(async () => {
      await o.waitForIdle();
      if (name === o.activeFileRef.current) await o.saveNow();
      await deleteNote(name);
      updatePins(name);
      if (name === o.activeFileRef.current) apply(null, "");
      await o.refreshNotes();
    });
  return {
    openNote,
    createNote,
    importNote,
    prepareToLeave,
    runOperation: run,
    operationBusy,
    waitForOperation,
    handleExport: async (name: string) =>
      run(async () => {
        await exportNote(await textFor(name), name);
      }),
    handleCopyContent: async (name: string) =>
      run(async () => {
        await navigator.clipboard.writeText(await textFor(name));
      }),
    handleOpenInExplorer: async (name: string) =>
      run(async () => {
        await openInExplorer(name);
      }),
    handleRename,
    handleDelete,
    toastMsg,
    toastKey,
    resetToast: () => setToastKey(0),
    toast,
  };
}
