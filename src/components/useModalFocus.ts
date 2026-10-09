import { useEffect, type RefObject } from "react";
export function useModalFocus(
  root: RefObject<HTMLElement>,
  onCancel: () => void,
) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const container = root.current;
    if (!container) return;
    const focusable = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,[tabindex="0"]',
        ),
      );
    focusable()[0]?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
      if (e.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    container.addEventListener("keydown", listener);
    return () => {
      container.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, []);
}
