import { tr, useLocale } from "../../i18n";
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
  useLocale();

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
    const edge = 8;
    ref.current.style.left = `${Math.max(edge, Math.min(x, window.innerWidth - r.width - edge))}px`;
    ref.current.style.top = `${Math.max(edge, Math.min(y, window.innerHeight - r.height - edge))}px`;
  }, [x, y, locale]);

  return createPortal(
    <div ref={ref} className="ctx-menu" style={style}>
      <Item
        label={pinned ? tr("ui.unpin") : tr("ui.pin")}
        onClick={() => {
          onTogglePin(fileName);
          onClose();
        }}
      />
      <Item
        label={tr("ui.copyToScratchpad")}
        onClick={() => {
          onToFloat(fileName);
          onClose();
        }}
      />
      {onManageTags && (
        <Item
          label={tr("ui.addTags")}
          onClick={() => {
            onManageTags(fileName);
            onClose();
          }}
        />
      )}
      <div className="ctx-menu-divider" />
      <Item
        label={tr("ui.rename")}
        onClick={() => {
          onRename(fileName);
          onClose();
        }}
      />
      <Item
        label={tr("ui.copyContent")}
        onClick={() => {
          onCopyContent(fileName);
          onClose();
        }}
      />
      <Item
        label={tr("ui.saveAs")}
        onClick={() => {
          onExport(fileName);
          onClose();
        }}
      />
      <Item
        label={tr("ui.showInFileExplorer")}
        onClick={() => {
          onOpenInExplorer(fileName);
          onClose();
        }}
      />
      <div className="ctx-menu-divider" />
      <Item
        label={tr("ui.delete")}
        title={tr("ui.moveToTheWindowsRecycleBinYouCanRestore")}
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
