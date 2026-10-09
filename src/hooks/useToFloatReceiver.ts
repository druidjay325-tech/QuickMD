import { useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { replaceBuffer } from "../commands";
import {
  EVENT_TO_FLOAT,
  EVENT_ARCHIVE_REQUEST,
  type ToFloatPayload,
} from "../events";
interface Options {
  isLoadingRef: React.MutableRefObject<boolean>;
  saveNow: () => Promise<void>;
  setContent: (s: string) => void;
  onReceive: (name: string, text: string) => void;
  getTitle: () => string;
  getContent: () => string;
  isBusy: () => boolean;
  setBusy: (busy: boolean) => void;
  onError?: (s: string) => void;
}
export function useToFloatReceiver(options: Options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    let busy = false;
    listen<ToFloatPayload>(EVENT_TO_FLOAT, async (e) => {
      if (busy || current.current.isBusy()) {
        current.current.onError?.("浮窗正在处理，请稍后重试");
        await emit("quickmd:transfer-complete", {
          requestId: e.payload.requestId,
          ok: false,
          error: "浮窗正在处理，请稍后重试",
        });
        return;
      }
      busy = true;
      current.current.setBusy(true);
      try {
        const o = current.current;
        await o.saveNow();
        const previous = o.getContent();
        const archived = await replaceBuffer(
          e.payload.content,
          o.getTitle() + ".md",
        );
        if (previous !== o.getContent()) {
          await o.saveNow();
          o.onError?.("接收期间有新的编辑，当前草稿已保留；请再次移入");
          await emit("quickmd:transfer-complete", {
            requestId: e.payload.requestId,
            ok: false,
            error: "接收期间有新的编辑，请再次移入",
          });
          return;
        }
        o.isLoadingRef.current = true;
        o.setContent(e.payload.content);
        o.onReceive(e.payload.fileName.replace(/\.md$/, ""), e.payload.content);
        o.isLoadingRef.current = false;
        await emit("quickmd:transfer-complete", {
          requestId: e.payload.requestId,
          ok: true,
        });
        if (archived)
          await emit(EVENT_ARCHIVE_REQUEST, { archivedFileName: archived });
      } catch (err) {
        current.current.onError?.(String(err));
        await emit("quickmd:transfer-complete", {
          requestId: e.payload.requestId,
          ok: false,
          error: String(err),
        });
      } finally {
        busy = false;
        current.current.setBusy(false);
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else stop = fn;
      })
      .catch((e) => current.current.onError?.(String(e)));
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
}
