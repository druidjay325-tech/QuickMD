import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { EVENT_ARCHIVE_REQUEST, type ArchivePayload } from "../events";
interface Options {
  isLoadingRef: React.MutableRefObject<boolean>;
  setContent: (s: string) => void;
  setCurrentFile: (s: string | null, c?: string) => void;
  loadNotes: () => Promise<void>;
  onError?: (s: string) => void;
  openNote: (s: string) => Promise<void>;
}
export function useArchiveReceiver(options: Options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    listen<ArchivePayload>(EVENT_ARCHIVE_REQUEST, async (e) => {
      try {
        await current.current.loadNotes();
        await current.current.openNote(e.payload.archivedFileName);
      } catch (err) {
        current.current.onError?.(String(err));
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
