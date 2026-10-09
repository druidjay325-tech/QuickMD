import { useCallback, useEffect, useRef, useState } from "react";
import { saveNote, saveBuffer, createNote } from "../commands";
import { getTimestampFileName } from "../utils/wordCount";
import { SaveSession } from "../utils/saveSession";
export type SaveStatus = "saved" | "saving" | "unsaved" | "error";
export type SaveMode = "file" | "buffer";
interface Options {
  getContent: () => string;
  delay?: number;
  onSaved?: () => void;
  autoSaveEnabled?: boolean;
}
export function useAutoSave({
  getContent,
  delay = 1000,
  onSaved,
  autoSaveEnabled = true,
}: Options) {
  const [saveStatus, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setError] = useState("");
  const [currentFile, setFileState] = useState<string | null>(null);
  const file = useRef<string | null>(null),
    mode = useRef<SaveMode>("file"),
    baseline = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useRef(new SaveSession());
  const contentFn = useRef(getContent);
  contentFn.current = getContent;
  const savedFn = useRef(onSaved);
  savedFn.current = onSaved;
  const enabled = useRef(autoSaveEnabled);
  enabled.current = autoSaveEnabled;
  const dirty = useRef(false);
  const cancelTimer = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  const setCurrentFile = useCallback(
    (name: string | null, loadedContent?: string) => {
      cancelTimer();
      session.current.nextGeneration();
      file.current = name;
      setFileState(name);
      if (loadedContent !== undefined) {
        baseline.current = loadedContent;
        dirty.current = false;
        setStatus("saved");
        setError("");
      }
    },
    [cancelTimer],
  );
  const setMode = useCallback((value: SaveMode) => {
    mode.current = value;
  }, []);
  const saveNow = useCallback(
    async (force = false) => {
      cancelTimer();
      const text = contentFn.current(),
        target = file.current,
        currentMode = mode.current,
        generation = session.current.currentGeneration();
      await session.current.enqueue(async () => {
        if (generation !== session.current.currentGeneration())
          throw new Error("文档已切换，请保存当前内容");
        if (!force && text === baseline.current) {
          if (contentFn.current() === text) {
            dirty.current = false;
            setStatus("saved");
          }
          return;
        }
        setStatus("saving");
        setError("");
        try {
          if (currentMode === "buffer")
            await saveBuffer(text, baseline.current);
          else if (target || file.current)
            await saveNote(target || file.current!, text, baseline.current);
          else {
            const name = await createNote(getTimestampFileName(), text);
            if (generation === session.current.currentGeneration()) {
              file.current = name;
              setFileState(name);
            }
          }
          if (generation === session.current.currentGeneration()) {
            baseline.current = text;
            dirty.current = contentFn.current() !== text;
            setStatus(dirty.current ? "unsaved" : "saved");
            savedFn.current?.();
          }
        } catch (e) {
          if (generation === session.current.currentGeneration()) {
            dirty.current = true;
            setStatus("error");
            setError(String(e));
          }
          throw e;
        }
      });
    },
    [cancelTimer],
  );
  const scheduleSave = useCallback(() => {
    cancelTimer();
    dirty.current = true;
    setStatus("unsaved");
    if (enabled.current)
      timer.current = setTimeout(() => {
        saveNow().catch(() => {});
      }, delay);
  }, [cancelTimer, delay, saveNow]);
  const reset = useCallback(() => {
    setCurrentFile(null, "");
  }, [setCurrentFile]);
  const isDirty = useCallback(
    () => dirty.current || contentFn.current() !== baseline.current,
    [],
  );
  const waitForIdle = useCallback(() => session.current.idle(), []);
  useEffect(() => () => cancelTimer(), [cancelTimer]);
  return {
    getCurrentFile: () => file.current,
    saveStatus,
    saveError,
    currentFile,
    setCurrentFile,
    setMode,
    scheduleSave,
    saveNow,
    reset,
    isDirty,
    waitForIdle,
  };
}
