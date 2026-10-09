import { useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { finishExit } from "../commands";
export async function flushOtherWindow(label: "main" | "float") {
  if ((window as any).__QUICKMD_BROWSER__) return;
  const id = crypto.randomUUID();
  let stop: () => void = () => {};
  let timer: ReturnType<typeof setTimeout>;
  try {
    await new Promise<void>(async (resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("另一窗口未能完成保存，当前操作已取消")),
        8000,
      );
      try {
        stop = await listen<{ id: string; ok: boolean; error?: string }>(
          "quickmd:flush-complete",
          (e) => {
            if (e.payload.id !== id) return;
            e.payload.ok
              ? resolve()
              : reject(new Error(e.payload.error || "另一窗口保存失败"));
          },
        );
        await emit("quickmd:flush-request", { id, label });
      } catch (e) {
        reject(e);
      }
    });
  } finally {
    clearTimeout(timer!);
    stop();
  }
}
export function useWindowLifecycle(
  label: "main" | "float",
  save: () => Promise<void>,
  onError: (s: string) => void,
) {
  const callbacks = useRef({ save, onError });
  callbacks.current = { save, onError };
  useEffect(() => {
    const cleanup: Array<() => void> = [];
    let disposed = false;
    let busy = false;
    const subscribe = async <T>(name: string, cb: (payload: T) => void) => {
      const stop = await listen<T>(name, (e) => cb(e.payload));
      if (disposed) stop();
      else cleanup.push(stop);
    };
    const hide = async () => {
      if (busy) return;
      busy = true;
      try {
        await callbacks.current.save();
        await getCurrentWindow().hide();
      } catch (e) {
        callbacks.current.onError(String(e));
      } finally {
        busy = false;
      }
    };
    subscribe<{ id: string; label: string }>(
      "quickmd:flush-request",
      async (p) => {
        if (p.label !== label) return;
        try {
          await callbacks.current.save();
          await emit("quickmd:flush-complete", { id: p.id, ok: true });
        } catch (e) {
          await emit("quickmd:flush-complete", {
            id: p.id,
            ok: false,
            error: String(e),
          });
        }
      },
    ).catch(() => {});
    if (label === "float")
      subscribe("quickmd:float-close-requested", hide).catch(() => {});
    if (label === "main")
      subscribe("quickmd:exit-requested", async () => {
        if (busy) return;
        busy = true;
        try {
          await callbacks.current.save();
          await flushOtherWindow("float");
          await finishExit();
        } catch (e) {
          await getCurrentWindow().show();
          callbacks.current.onError(String(e));
        } finally {
          busy = false;
        }
      }).catch(() => {});
    return () => {
      disposed = true;
      cleanup.forEach((stop) => stop());
    };
  }, [label]);
}
