import { tr, useLocale } from "../../i18n";
import { useEffect, useRef } from "react";
import "../sidebar/ContextMenu.css";

interface EditorContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onCut?: () => void;
  onCopy: () => void;
  onPaste?: () => void;
  onSelectAll: () => void;
}

function Item({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  useLocale();

  return (
    <div
      className={`ctx-menu-item${danger ? " ctx-menu-item-danger" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      role="menuitem"
      tabIndex={0}
    >
      {label}
    </div>
  );
}

export function EditorContextMenu({
  x,
  y,
  onClose,
  onCut,
  onCopy,
  onPaste,
  onSelectAll,
}: EditorContextMenuProps) {
  const locale = useLocale();

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const kfn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", fn);
    document.addEventListener("keydown", kfn);
    return () => {
      document.removeEventListener("mousedown", fn);
      document.removeEventListener("keydown", kfn);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: x,
    top: y,
    zIndex: 9999,
  };
  useEffect(() => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const edge = 8;
    ref.current.style.left = `${Math.max(edge, Math.min(x, window.innerWidth - r.width - edge))}px`;
    ref.current.style.top = `${Math.max(edge, Math.min(y, window.innerHeight - r.height - edge))}px`;
  }, [x, y, locale]);

  return (
    <div ref={ref} className="ctx-menu" style={style}>
      {onCut && (
        <Item
          label={tr("ui.cut")}
          onClick={() => {
            onCut();
            onClose();
          }}
        />
      )}
      <Item
        label={tr("ui.copy")}
        onClick={() => {
          onCopy();
          onClose();
        }}
      />
      {onPaste && (
        <Item
          label={tr("ui.paste")}
          onClick={() => {
            onPaste();
            onClose();
          }}
        />
      )}
      <div className="ctx-menu-divider" />
      <Item
        label={tr("ui.selectAll")}
        onClick={() => {
          onSelectAll();
          onClose();
        }}
      />
    </div>
  );
}
