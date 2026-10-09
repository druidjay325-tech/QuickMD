import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./ContextMenu.css";

interface ContextMenuProps {
  x: number;
  y: number;
  fileName: string;
  pinned: boolean;
  onClose: () => void;
  onTogglePin: (fileName: string) => void;
  onExport: (fileName: string) => void;
  onRename: (fileName: string) => void;
  onDelete: (fileName: string) => void;
  onCopyContent: (fileName: string) => void;
  onOpenInExplorer: (fileName: string) => void;
  onToFloat: (fileName: string) => void;
  onManageTags?: (fileName: string) => void;
}

function Item({
  label,
  onClick,
  danger,
  title,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  title?: string;
}) {
  return (
    <div
      className={`ctx-menu-item${danger ? " ctx-menu-item-danger" : ""}`}
      title={title}
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

export function ContextMenu({
  x,
  y,
  fileName,
  pinned,
  onClose,
  onTogglePin,
  onExport,
  onRename,
  onDelete,
  onCopyContent,
  onOpenInExplorer,
  onToFloat,
  onManageTags,
}: ContextMenuProps) {
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

  // Keep menu within viewport
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

  return createPortal(
    <div ref={ref} className="ctx-menu" style={style}>
      <Item
        label={pinned ? "取消置顶" : "置顶"}
        onClick={() => {
          onTogglePin(fileName);
          onClose();
        }}
      />
      <Item
        label="移入浮窗"
        onClick={() => {
          onToFloat(fileName);
          onClose();
        }}
      />
      {onManageTags && (
        <Item
          label="添加标签"
          onClick={() => {
            onManageTags(fileName);
            onClose();
          }}
        />
      )}
      <div className="ctx-menu-divider" />
      <Item
        label="重命名"
        onClick={() => {
          onRename(fileName);
          onClose();
        }}
      />
      <Item
        label="复制内容"
        onClick={() => {
          onCopyContent(fileName);
          onClose();
        }}
      />
      <Item
        label="另存为…"
        onClick={() => {
          onExport(fileName);
          onClose();
        }}
      />
      <Item
        label="在资源管理器中打开"
        onClick={() => {
          onOpenInExplorer(fileName);
          onClose();
        }}
      />
      <div className="ctx-menu-divider" />
      <Item
        label="删除"
        title="移入系统回收站，可在系统回收站中还原"
        onClick={() => {
          onDelete(fileName);
          onClose();
        }}
        danger
      />
    </div>,
    document.body,
  );
}
