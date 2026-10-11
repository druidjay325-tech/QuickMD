import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { importImage } from "../commands";
import { tr } from "../i18n";
import type { CodeEditorHandle } from "../components/editor/CodeEditor";

interface Options {
  editorRef: React.MutableRefObject<CodeEditorHandle | null>;
  getContext: () => string | number;
  canInsert: () => boolean;
  isPreview: () => boolean;
  toast: (message: string) => void;
}

/** Both native drops and the picker insert into the captured editing session. */
export function useImageInsert(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const busy = useRef(false);
  const mounted = useRef(true);
  const directoryRevision = useRef(0);
  const waiters = useRef<Array<() => void>>([]);
  useEffect(() => {
    mounted.current = true;
    const stop = listen("quickmd:directory-changed", () => {
      directoryRevision.current++;
    });
    return () => {
      mounted.current = false;
      stop.then((unlisten) => unlisten());
    };
  }, []);

  const insert = async (pick: () => Promise<string[]>) => {
    const o = latest.current;
    if (o.isPreview()) {
      o.toast(tr("images.switchToEdit"));
      return;
    }
    const editor = o.editorRef.current;
    if (busy.current || !o.canInsert() || !editor) {
      o.toast(tr("images.busy"));
      return;
    }
    busy.current = true;
    const context = o.getContext();
    const content = editor.getContent();
    const selection = editor.getSelection();
    const directory = directoryRevision.current;
    const isCurrent = () =>
      mounted.current &&
      latest.current.canInsert() &&
      !latest.current.isPreview() &&
      latest.current.editorRef.current === editor &&
      latest.current.getContext() === context &&
      editor.getContent() === content &&
      directoryRevision.current === directory;
    try {
      const paths = await pick();
      if (!paths.length) return;
      const references: string[] = [];
      let failed = 0;
      for (const path of paths) {
        if (!isCurrent()) {
          if (mounted.current) latest.current.toast(tr("images.cancelled"));
          return;
        }
        try {
          const relative = await importImage(path);
          references.push(tr("ui.image2", { v0: relative }));
        } catch {
          failed++;
        }
      }
      if (!isCurrent()) {
        if (mounted.current) latest.current.toast(tr("images.cancelled"));
        return;
      }
      if (references.length) {
        editor.selectRange(selection.start, selection.end);
        editor.replaceSelection("\n" + references.join("\n") + "\n");
      }
      if (failed) latest.current.toast(tr("images.failed", { count: failed }));
    } catch {
      if (mounted.current) latest.current.toast(tr("images.pickerFailed"));
    } finally {
      busy.current = false;
      waiters.current.splice(0).forEach((resolve) => resolve());
    }
  };
  return {
    insertImages: (paths: string[]) => insert(async () => paths),
    chooseImages: () =>
      insert(async () => {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const result = await open({
          title: tr("ui.chooseAnImage"),
          multiple: true,
          filters: [
            {
              name: tr("ui.image"),
              extensions: ["png", "jpg", "jpeg", "gif", "webp"],
            },
          ],
        });
        return result ? (Array.isArray(result) ? result : [result]) : [];
      }),
    waitForImages: () =>
      busy.current
        ? new Promise<void>((resolve) => waiters.current.push(resolve))
        : Promise.resolve(),
  };
}
