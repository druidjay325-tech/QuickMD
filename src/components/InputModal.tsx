/**
 * Promise-based input modal — replaces browser prompt() with a styled component.
 * Usage: const result = await openInputModal({ title, defaultValue, label });
 * Returns string on confirm, null on cancel.
 */
import { useState, useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import "../styles/input-modal.css";
import { useModalFocus } from "./useModalFocus";

interface InputModalOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
}

let modalRoot: HTMLDivElement | null = null;
let reactRoot: Root | null = null;

export function openInputModal(
  options: InputModalOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!modalRoot) {
      modalRoot = document.createElement("div");
      modalRoot.id = "input-modal-root";
      document.body.appendChild(modalRoot);
    }
    if (reactRoot) reactRoot.unmount();
    reactRoot = createRoot(modalRoot);

    const handleClose = (result: string | null) => {
      reactRoot?.unmount();
      reactRoot = null;
      resolve(result);
    };

    reactRoot.render(<InputModalInner {...options} onClose={handleClose} />);
  });
}

function InputModalInner({
  title,
  label,
  defaultValue = "",
  placeholder,
  confirmText = "确定",
  onClose,
}: InputModalOptions & { onClose: (result: string | null) => void }) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useModalFocus(cardRef, () => onClose(null));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (trimmed) onClose(trimmed);
  };

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
        {label && <label className="input-modal-label">{label}</label>}
        <input
          ref={inputRef}
          aria-label={label || title}
          className="input-modal-field"
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
            if (e.key === "Escape") onClose(null);
          }}
        />
        <div className="input-modal-actions">
          <button
            className="input-modal-btn input-modal-cancel"
            onClick={() => onClose(null)}
          >
            取消
          </button>
          <button
            className="input-modal-btn input-modal-confirm"
            onClick={handleConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
