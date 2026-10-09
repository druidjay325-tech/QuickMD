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
    if (r.right > window.innerWidth)
      ref.current.style.left = `${x - r.width}px`;
    if (r.bottom > window.innerHeight)
      ref.current.style.top = `${y - r.height}px`;
  }, [x, y]);

  return (
    <div ref={ref} className="ctx-menu" style={style}>
      {onCut && (
        <Item
          label="剪切"
          onClick={() => {
            onCut();
            onClose();
          }}
        />
      )}
      <Item
        label="复制"
        onClick={() => {
          onCopy();
          onClose();
        }}
      />
      {onPaste && (
        <Item
          label="粘贴"
          onClick={() => {
            onPaste();
            onClose();
          }}
        />
      )}
      <div className="ctx-menu-divider" />
      <Item
        label="全选"
        onClick={() => {
          onSelectAll();
          onClose();
        }}
      />
    </div>
  );
}
