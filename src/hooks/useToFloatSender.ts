import { useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { loadNote } from "../commands";
import { EVENT_TO_FLOAT, type ToFloatPayload } from "../events";
interface Options {
  contentRef: React.MutableRefObject<string>;
  activeFileRef: React.MutableRefObject<string | null>;
  getCurrentFile: () => string | null;
  saveNow: () => Promise<void>;
  onError?: (s: string) => void;
}
export function useToFloatSender({
  contentRef,
  getCurrentFile,
  saveNow,
  onError,
}: Options) {
  const handleToFloat = useCallback(
    async (targetName?: string) => {
      let stop = () => {};
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if ((window as any).__QUICKMD_BROWSER__)
          throw Error("双窗转移请在桌面版中体验；浏览器预览不连接本地档案");
        const isCurrent = !targetName || targetName === getCurrentFile();
        if (isCurrent) await saveNow();
        const fileName = targetName || getCurrentFile();
        if (!fileName) throw Error("请先保存便利贴");
        const content = isCurrent
          ? contentRef.current
          : await loadNote(fileName);
        if (!content.trim()) throw Error("该便利贴没有内容");
        const w = await WebviewWindow.getByLabel("float");
        if (!w) throw Error("浮窗尚未就绪");
        await w.unminimize();
        await w.show();
        await w.setFocus();
        const requestId = crypto.randomUUID();
        const completion = new Promise<void>(async (resolve, reject) => {
          timer = setTimeout(
            () => reject(Error("浮窗未确认接收，原便利贴已保留，请稍后重试")),
            8000,
          );
          try {
            stop = await listen<{
              requestId: string;
              ok: boolean;
              error?: string;
            }>("quickmd:transfer-complete", (e) => {
              if (e.payload.requestId === requestId)
                e.payload.ok
                  ? resolve()
                  : reject(Error(e.payload.error || "移入浮窗失败"));
            });
            const payload: ToFloatPayload = { requestId, content, fileName };
            await emit(EVENT_TO_FLOAT, payload);
          } catch (e) {
            reject(e);
          }
        });
        await completion;
      } catch (e) {
        onError?.(String(e));
      } finally {
        if (timer) clearTimeout(timer);
        stop();
      }
    },
    [contentRef, getCurrentFile, saveNow, onError],
  );
  return { handleToFloat };
}
