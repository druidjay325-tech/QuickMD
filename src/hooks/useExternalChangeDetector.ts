import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { loadNote } from "../commands";

interface UseExternalChangeDetectorOptions {
  activeFile: string | null;
  /** Current editor content (ref, updated on every keystroke/load) */
  contentRef: React.MutableRefObject<string>;
  /** Whether the editor has unsaved changes */
  isDirty: boolean;
  /** Flush pending save immediately */
  flushSave: () => Promise<void>;
  /** Reload the note from disk */
  onReloadRequest: (fileName: string, newContent: string) => void;
  /** Whether to flush on focus lost. Default true. Set false when autoSave is off. */
  flushOnFocusLost?: boolean;
}

/**
 * Detects external file modifications when the window gains visibility/focus.
 * Uses two layers: Tauri onFocusChanged + browser visibilitychange/window-focus.
 * Ref-based callbacks avoid re-registering listeners on prop changes.
 */
export function useExternalChangeDetector({
  activeFile,
  contentRef,
  isDirty,
  flushSave,
  onReloadRequest,
  flushOnFocusLost = true,
}: UseExternalChangeDetectorOptions) {
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;

  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;
  const onReloadRequestRef = useRef(onReloadRequest);
  onReloadRequestRef.current = onReloadRequest;
  const flushOnFocusLostRef = useRef(flushOnFocusLost);
  flushOnFocusLostRef.current = flushOnFocusLost;

  /** Core check: compare disk content with editor content */
  const checkExternal = async () => {
    const file = activeFileRef.current;
    if (!file) return;
    if (isDirtyRef.current) return; // editor dirty, skip
    const previousContent = contentRef.current;

    try {
      const diskContent = await loadNote(file);
      if (
        file !== activeFileRef.current ||
        isDirtyRef.current ||
        previousContent !== contentRef.current
      )
        return;
      if (diskContent !== contentRef.current) {
        onReloadRequestRef.current(file, diskContent);
      }
    } catch {
      /* file may not exist (NOT_FOUND) — skip */
    }
  };

  useEffect(() => {
    const cleanupFns: (() => void)[] = [];

    // Layer 1: Tauri window focus change
    (async () => {
      try {
        const w = getCurrentWebviewWindow();
        if (w?.onFocusChanged) {
          const unlisten = await w.onFocusChanged(
            async ({ payload: focused }) => {
              if (focused) {
                await checkExternal();
              } else {
                if (flushOnFocusLostRef.current && isDirtyRef.current) {
                  try {
                    await flushSaveRef.current();
                  } catch {}
                }
              }
            },
          );
          cleanupFns.push(unlisten);
        }
      } catch {}
    })();

    // Layer 2: Browser-level focus (catches tabs, alt-tab, etc.)
    const onWindowFocus = () => {
      checkExternal();
    };
    window.addEventListener("focus", onWindowFocus);
    cleanupFns.push(() => window.removeEventListener("focus", onWindowFocus));

    // Layer 3: Document visibility (catches tab switch, minimize/restore)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkExternal();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    cleanupFns.push(() =>
      document.removeEventListener("visibilitychange", onVisibilityChange),
    );

    return () => {
      for (const fn of cleanupFns) fn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — refs handle all dynamics
}
