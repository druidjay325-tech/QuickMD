import { useEffect, useRef } from "react";
import { readFileAbsolute } from "../commands";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const ACCEPTED_EXTENSIONS = [".md", ".txt"];
const IMAGE_EXTENSIONS = /\.(?:png|jpe?g|gif|webp)$/i;

interface UseFileDropOptions {
  onFileDrop: (content: string, fileName: string) => void | Promise<void>;
  onImageDrop?: (paths: string[]) => void | Promise<void>;
  onError?: (message: string) => void;
  onUnsupportedFile?: (fileName: string) => void;
  enabled?: boolean;
}

export function useFileDrop({
  onFileDrop,
  onImageDrop,
  onUnsupportedFile,
  onError,
  enabled = true,
}: UseFileDropOptions) {
  const onFileDropRef = useRef(onFileDrop);
  onFileDropRef.current = onFileDrop;
  const onUnsupportedRef = useRef(onUnsupportedFile);
  onUnsupportedRef.current = onUnsupportedFile;
  const cancelledRef = useRef(false);
  const imageDropRef = useRef(onImageDrop);
  imageDropRef.current = onImageDrop;
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    if (!enabled) return;

    cancelledRef.current = false;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelledRef.current) return;
        const payload = event.payload;
        if (payload.type !== "drop") return;
        if (!payload.paths || payload.paths.length === 0) return;
        const filePath = payload.paths[0];

        if (
          imageDropRef.current &&
          payload.paths.some((path) => IMAGE_EXTENSIONS.test(path))
        ) {
          const images = payload.paths.filter((path) =>
            IMAGE_EXTENSIONS.test(path),
          );
          // A mixed batch is rejected rather than silently dropping text files.
          if (images.length !== payload.paths.length) {
            onUnsupportedRef.current?.(
              filePath.split(/[\\/]/).pop() || filePath,
            );
            return;
          }
          (async () => {
            try {
              await imageDropRef.current?.(images);
            } catch (e) {
              errorRef.current?.(String(e));
            }
          })();
          return;
        }

        const isAccepted = ACCEPTED_EXTENSIONS.some((ext) =>
          filePath.toLowerCase().endsWith(ext),
        );
        if (!isAccepted) {
          const fileName = filePath.split(/[\\/]/).pop() || filePath;
          onUnsupportedRef.current?.(fileName);
          return;
        }

        (async () => {
          try {
            const content = await readFileAbsolute(filePath);
            if (cancelledRef.current) return;
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            await onFileDropRef.current(content, fileName);
          } catch (e) {
            errorRef.current?.(String(e));
          }
        })();
      })
      .then((fn) => {
        if (cancelledRef.current) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((e) => console.error("[useFileDrop] registration:", e));

    return () => {
      cancelledRef.current = true;
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  }, [enabled]);
}
