import { memo, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { ContextMenu } from "./ContextMenu";
import { IconPin, IconPlus, IconChevronLeft, IconChevronRight } from "../Icons";
import "./Sidebar.css";

interface NoteInfo {
  file_name: string;
  modified: number;
  size: number;
  tags: string[];
  /** Content snippet showing search match (undefined = all-notes mode) */
  snippet?: string;
  /** Start offset within snippet where match begins */
  matchStart?: number;
  /** Length of the matched substring */
  matchLength?: number;
}

function formatTime(seconds: number): string {
  const date = new Date(seconds * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffHour < 48) return "昨天";

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  if (y === now.getFullYear()) return `${m}-${d}`;
  return `${y}-${m}-${d}`;
}

interface SidebarProps {
  notes: NoteInfo[];
  activeFile: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (fileName: string) => void;
  onCreate: () => void;
  pinned: Set<string>;
  onTogglePin: (fileName: string) => void;
  onExport?: (fileName: string) => void;
  onRename?: (fileName: string) => void;
  onDelete?: (fileName: string) => void;
  onCopyContent?: (fileName: string) => void;
  onOpenInExplorer?: (fileName: string) => void;
  onToFloat?: (fileName: string) => void;
  onManageTags?: (fileName: string) => void;
  /** Whether a content search is in progress */
  searching?: boolean;
  tagFilter: Set<string>;
  onTagFilter: (tags: Set<string>) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface CtxState {
  x: number;
  y: number;
  fileName: string;
}

function SidebarInner({
  notes,
  activeFile,
  searchQuery,
  onSearchChange,
  onSelect,
  onCreate,
  pinned,
  onTogglePin,
  onExport,
  onRename,
  onDelete,
  onCopyContent,
  onOpenInExplorer,
  onToFloat,
  onManageTags,
  searching,
  tagFilter,
  onTagFilter,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [ctx, setCtx] = useState<CtxState | null>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, fileName: string) => {
      e.preventDefault();
      setCtx({ x: e.clientX, y: e.clientY, fileName });
    },
    [],
  );

  const closeCtx = useCallback(() => setCtx(null), []);

  // Compute all unique tags from notes, sorted alphabetically
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) {
      for (const t of n.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [notes]);

  const toggleTag = useCallback(
    (tag: string) => {
      const next = new Set(tagFilter);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      onTagFilter(next);
    },
    [tagFilter, onTagFilter],
  );

  // When content search is active (>= 2 chars), notes are pre-filtered server-side
  const isContentSearch = searchQuery.length >= 2;
  let filtered = isContentSearch
    ? notes
    : notes.filter((n) =>
        n.file_name.toLowerCase().includes(searchQuery.toLowerCase()),
      );
  // Multi-tag filter: note must have ALL selected tags
  if (tagFilter.size > 0) {
    filtered = filtered.filter((n) => {
      if (n.tags.length === 0) return false;
      return Array.from(tagFilter).every((t) => n.tags.includes(t));
    });
  }

  // Sort: pinned first (by pin order), then by modified time
  const sorted = useMemo(() => {
    const pinnedArr = Array.from(pinned);
    return [...filtered].sort((a, b) => {
      const aIdx = pinnedArr.indexOf(a.file_name);
      const bIdx = pinnedArr.indexOf(b.file_name);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return b.modified - a.modified;
    });
  }, [filtered, pinned]);

  // ── Scroll fade state ──────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null);
  const [fadeState, setFadeState] = useState<
    "none" | "bottom" | "top" | "both"
  >("none");

  const updateFade = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    if (atTop && atBottom) setFadeState("none");
    else if (atTop) setFadeState("bottom");
    else if (atBottom) setFadeState("top");
    else setFadeState("both");
  }, []);

  useEffect(() => {
    updateFade();
  }, [updateFade, sorted.length]);

  if (collapsed) {
    return (
      <div className="sidebar sidebar-collapsed">
        <div className="sidebar-collapsed-top">
          <button
            className="sidebar-expand-btn"
            onClick={onToggleCollapse}
            title="展开侧边栏"
          >
            <IconChevronRight />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar">
      <div className="sidebar-search-row">
        <input
          type="text"
          placeholder="搜索便利贴..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <button
          className="sidebar-new-btn"
          onClick={onCreate}
          title="新建便利贴 (Ctrl+N)"
          aria-label="新建便利贴"
        >
          <IconPlus />
        </button>
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title="收起侧边栏"
        >
          <IconChevronLeft />
        </button>
      </div>

      {/* Tag bar: always visible when there are tags */}
      {allTags.length > 0 && (
        <div className="sidebar-tag-bar">
          <div className="sidebar-tag-bar-inner">
            {allTags.map((tag) => (
              <span
                key={tag}
                className={`sidebar-tag-bar-btn ${tagFilter.has(tag) ? "active" : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={tagFilter.has(tag)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleTag(tag);
                  }
                }}
                onClick={() => toggleTag(tag)}
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className={`sidebar-list fade-${fadeState}`}
        ref={listRef}
        onScroll={updateFade}
      >
        {searching && (
          <div className="sidebar-search-status" role="status">
            正在寻找…
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="sidebar-empty">
            {searching
              ? "正在寻找…"
              : searchQuery
                ? "没有找到匹配的便利贴"
                : "还没有便利贴。写下第一个想法吧。"}
          </div>
        ) : (
          sorted.map((note) => (
            <div
              key={note.file_name}
              className={`sidebar-item ${activeFile === note.file_name ? "active" : ""}`}
              role="button"
              tabIndex={0}
              aria-label={note.file_name}
              aria-pressed={activeFile === note.file_name}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(note.file_name);
                }
                if (
                  e.key === "ContextMenu" ||
                  (e.shiftKey && e.key === "F10")
                ) {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setCtx({
                    x: r.left + 20,
                    y: r.top + 20,
                    fileName: note.file_name,
                  });
                }
              }}
              onClick={() => onSelect(note.file_name)}
              onContextMenu={(e) => handleContextMenu(e, note.file_name)}
            >
              <div className="sidebar-item-title">
                {pinned.has(note.file_name) && <IconPin />}
                {note.file_name.replace(".md", "")}
              </div>
              {note.snippet != null &&
              note.matchStart != null &&
              note.matchLength != null ? (
                (() => {
                  const ctxBefore = 12;
                  const matchText = note.snippet.slice(
                    note.matchStart,
                    note.matchStart + note.matchLength,
                  );
                  const fullSnippet = note.snippet;
                  const ms = note.matchStart;
                  const ml = note.matchLength;
                  const before = fullSnippet.slice(
                    Math.max(0, ms - ctxBefore),
                    ms,
                  );
                  const after = fullSnippet.slice(ms + ml, ms + ml + 30);
                  return (
                    <div className="sidebar-item-snippet">
                      {ms > ctxBefore ? "…" : null}
                      <span style={{ color: "var(--text-muted)" }}>
                        {before}
                      </span>
                      <span style={{ color: "#ff8c00", fontWeight: "bold" }}>
                        {matchText}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {after}
                      </span>
                      {ms + ml + 30 < fullSnippet.length ? "…" : null}
                    </div>
                  );
                })()
              ) : (
                <div className="sidebar-item-meta">
                  {formatTime(note.modified)}
                </div>
              )}
              {note.tags.length > 0 && (
                <div className="sidebar-item-tags">
                  {note.tags.map((tag) => {
                    return (
                      <span
                        key={tag}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleTag(tag);
                          }
                        }}
                        className={`sidebar-tag${tagFilter.has(tag) ? " sidebar-tag-filtered" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTag(tag);
                        }}
                      >
                        #{tag}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {ctx && onExport && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          fileName={ctx.fileName}
          pinned={pinned.has(ctx.fileName)}
          onClose={closeCtx}
          onTogglePin={onTogglePin}
          onExport={onExport}
          onRename={onRename || (() => {})}
          onDelete={onDelete || (() => {})}
          onCopyContent={onCopyContent || (() => {})}
          onOpenInExplorer={onOpenInExplorer || (() => {})}
          onToFloat={onToFloat || (() => {})}
          onManageTags={onManageTags}
        />
      )}
    </div>
  );
}

const Sidebar = memo(SidebarInner);
export { Sidebar };
export type { NoteInfo };
