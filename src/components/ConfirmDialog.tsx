/**
 * Promise-based confirm dialog — supports custom buttons.
 * Usage: const result = await openConfirmDialog({ title, message, buttons });
 * Returns the value of the clicked button, or null if dismissed (overlay click / Esc).
 */
import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import "../styles/input-modal.css";
import { useModalFocus } from "./useModalFocus";

interface ConfirmButton {
  text: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

interface ConfirmDialogOptions {
  title: string;
  message?: string;
  buttons: ConfirmButton[];
}

let dialogRoot: HTMLDivElement | null = null;
let reactRoot: Root | null = null;

export function openConfirmDialog(
  options: ConfirmDialogOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!dialogRoot) {
      dialogRoot = document.createElement("div");
      dialogRoot.id = "confirm-dialog-root";
      document.body.appendChild(dialogRoot);
    }
    if (reactRoot) reactRoot.unmount();
    reactRoot = createRoot(dialogRoot);

    const handleClose = (result: string | null) => {
      reactRoot?.unmount();
      reactRoot = null;
      resolve(result);
    };

    reactRoot.render(<ConfirmDialogInner {...options} onClose={handleClose} />);
  });
}

function ConfirmDialogInner({
  title,
  message,
  buttons,
  onClose,
}: ConfirmDialogOptions & { onClose: (result: string | null) => void }) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useModalFocus(cardRef, () => onClose(null));

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  return (
    <div className="input-modal-overlay" onClick={() => onClose(null)}>
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="input-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="input-modal-title">{title}</h3>
        {message && (
          <p
            style={{
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              margin: "0 0 12px",
            }}
          >
            {message}
          </p>
        )}
        <div className="input-modal-actions">
          {buttons.map((btn) => (
            <button
              key={btn.value}
              ref={btn.primary ? primaryRef : undefined}
              className={`input-modal-btn ${btn.primary ? "input-modal-confirm" : ""}`}
              style={btn.danger ? { color: "#ff6b6b" } : undefined}
              onClick={() => onClose(btn.value)}
            >
              {btn.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
