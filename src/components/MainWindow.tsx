import { useCallback, useEffect, useRef, useState } from "react";
import { useExternalChangeDetector } from "../hooks/useExternalChangeDetector";
import { useArchiveReceiver } from "../hooks/useArchiveReceiver";
import { useToFloatSender } from "../hooks/useToFloatSender";
import { useAutoSave } from "../hooks/useAutoSave";
import { useNoteOperations } from "../hooks/useNoteOperations";
import { useFileDrop } from "../hooks/useFileDrop";
import { Sidebar, type NoteInfo } from "./sidebar/Sidebar";
import { TagEditor } from "./editor/TagEditor";
import CodeEditor from "./editor/CodeEditor";
import type { CodeEditorHandle } from "./editor/CodeEditor";
import Preview from "./editor/Preview";
import MdToolbar from "./editor/MdToolbar";
import { IconFloat } from "./Icons";
import {
  listNotes,
  loadNote,
  searchNotes,
  getSettings,
  importImage,
} from "../commands";
import { countWords } from "../utils/wordCount";
import { updateMainWindowTitle } from "../utils/mainWindowTitle";
import { Toast } from "./Toast";
import { StatusBar } from "./StatusBar";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { listen } from "@tauri-apps/api/event";
import { EVENT_SETTINGS_CHANGED } from "../events";
import SettingsModal from "./editor/SettingsModal";
import { useWindowLifecycle } from "../hooks/useWindowLifecycle";
import { openConfirmDialog } from "./ConfirmDialog";
import { FindReplaceBar } from "./editor/FindReplaceBar";
import "../styles/main.css";

function MainWindow() {
  const layoutRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layout = layoutRef.current;
    const toolbar = toolbarRef.current;
    if (!layout || !toolbar) return;
    const syncToolbarHeight = () => {
      layout.style.setProperty(
        "--main-toolbar-height",
        `${toolbar.getBoundingClientRect().height}px`,
      );
    };
    syncToolbarHeight();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(syncToolbarHeight);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  // ── Editor state ────────────────────────────────────────────
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const contentRef = useRef("");
  const isLoadingRef = useRef(false);
  const [content, setContentState] = useState("");
  const [viewMode, setViewMode] = useState<"code" | "preview" | "split">(
    "split",
  );
  const [splitRatio, setSplitRatio] = useState(0.5);
  const splitRatioRef = useRef(0.5);
  const [scrollRatio, setScrollRatioState] = useState(0);
  const scrollSourceRef = useRef<"code" | "preview" | null>(null);

  const setContent = useCallback((text: string) => {
    contentRef.current = text; // 同步 ref 到最新，避免 swap/save 读到旧值
    setContentState(text);
    editorRef.current?.setContent(text);
  }, []);

  const wordCount = countWords(content);

  // ── Auto-save ──────────────────────────────────────────────
  const saveStatusRef = useRef<string>("saved");
  const lastUserFileRef = useRef<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  useEffect(() => {
    getSettings()
      .then((s) => setAutoSaveEnabled(s.auto_save))
      .catch(() => {});
    const unlisten = listen(EVENT_SETTINGS_CHANGED, () => {
      getSettings()
        .then((s) => setAutoSaveEnabled(s.auto_save))
        .catch(() => {});
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
  const {
    saveStatus,
    saveError,
    currentFile,
    setCurrentFile,
    scheduleSave,
    saveNow,
    isDirty,
    waitForIdle,
    getCurrentFile,
  } = useAutoSave({
    getContent: () => contentRef.current,
    autoSaveEnabled,
    onSaved: () => {
      loadNotes();
    },
  });
  useEffect(() => {
    saveStatusRef.current = saveStatus;
  }, [saveStatus]);
  const activeFile = currentFile;
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;

  useEffect(() => {
    updateMainWindowTitle(activeFile);
  }, [activeFile]);

  const handleContentChange = useCallback(
    (newContent: string) => {
      contentRef.current = newContent;
      setContentState(newContent);
      if (!isLoadingRef.current) scheduleSave();
    },
    [scheduleSave],
  );

  // ── Scroll sync (split mode) ──────────────────────────────
  const handleCodeScroll = useCallback((ratio: number) => {
    if (scrollSourceRef.current === "preview") {
      scrollSourceRef.current = null;
      return;
    }
    scrollSourceRef.current = "code";
    setScrollRatioState(ratio);
  }, []);

  const handlePreviewScroll = useCallback((ratio: number) => {
    if (scrollSourceRef.current === "code") {
      scrollSourceRef.current = null;
      return;
    }
    scrollSourceRef.current = "preview";
    editorRef.current?.setScrollRatio(ratio);
  }, []);

  // ── Draggable divider ─────────────────────────────────────
  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startRatio = splitRatioRef.current;
    const bodyEl = document.querySelector(".main-editor-body") as HTMLElement;
    if (!bodyEl) return;
    const bodyWidth = bodyEl.getBoundingClientRect().width;

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const ratio = Math.max(
        0.2,
        Math.min(0.8, startRatio + delta / bodyWidth),
      );
      splitRatioRef.current = ratio;
      bodyEl.style.setProperty("--split-ratio", `${ratio * 100}%`);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      setSplitRatio(splitRatioRef.current);
    };
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  // ── Sidebar state ──────────────────────────────────────────
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [notesRevision, setNotesRevision] = useState(0);
  const allNotesRef = useRef<NoteInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const [searching, setSearching] = useState(false);
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [tagEditorFile, setTagEditorFile] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);
  const [findCurrentIdx, setFindCurrentIdx] = useState(-1);
  const [findHighlights, setFindHighlights] = useState<
    { start: number; end: number; isCurrent: boolean }[]
  >([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("quickmd-sidebar-collapsed") === "true";
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("quickmd-sidebar-collapsed", String(next));
      return next;
    });
  }, []);
  const [pinned, setPinned] = useState<Set<string>>(() => {
    try {
      const v = JSON.parse(localStorage.getItem("quickmd-pinned") || "[]");
      return new Set(Array.isArray(v) ? v : []);
    } catch {
      return new Set();
    }
  });

  const handleTogglePin = useCallback((fileName: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      try {
        localStorage.setItem("quickmd-pinned", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, []);

  const loadNotes = useCallback(async () => {
    try {
      const list = await listNotes();
      allNotesRef.current = list;
      setNotesRevision((n) => n + 1);
      if (searchQueryRef.current.length < 2) setNotes(list);
    } catch (e) {
      toast(String(e));
    }
  }, []);

  // 一次 IPC 批量搜索，并丢弃过期结果。
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setNotes(allNotesRef.current);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const list = await searchNotes(q);
        if (!cancelled) setNotes(list);
      } catch (e) {
        if (!cancelled) toast(String(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, notesRevision]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Listen for open-settings event (from tray menu)
  useEffect(() => {
    const unlisten = listen("quickmd:open-settings", () =>
      setShowSettings(true),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for main window close request (from Rust)
  useEffect(() => {
    const unlisten = listen("quickmd:main-close-requested", async () => {
      if (isDirty()) {
        const result = await openConfirmDialog({
          title: "当前便利贴有未保存的更改",
          message: "是否保存后再关闭？",
          buttons: [
            { text: "保存并关闭", value: "save", primary: true },
            { text: "不保存", value: "discard" },
            { text: "取消", value: "cancel" },
          ],
        });
        if (result !== "save" && result !== "discard") return;
        if (result === "save") await saveNow();
      }
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().hide();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [saveNow]);

  // Ctrl+S / Ctrl+F
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveNow(true).catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        createNote();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [saveNow]);

  // ── Note operations ────────────────────────────────────────
  const {
    openNote,
    createNote,
    handleExport,
    handleRename,
    handleDelete,
    handleCopyContent,
    handleOpenInExplorer,
    importNote,
    operationBusy,
    runOperation,
    waitForOperation,
    toastMsg,
    toastKey,
    resetToast,
    toast,
  } = useNoteOperations({
    saveNow,
    saveStatusRef,
    activeFileRef,
    contentRef,
    isDirty,
    waitForIdle,
    setCurrentFile,
    setContent,
    setMarkdownSignal: setContentState,
    isLoadingRef,
    lastUserFileRef,
    refreshNotes: loadNotes,
  });

  useFileDrop({
    onFileDrop: importNote,
    onUnsupportedFile: () => toast("仅支持 .md 和 .txt 文件"),
    onError: toast,
  });
  useWindowLifecycle(
    "main",
    async () => {
      await waitForOperation();
      if (isDirty()) await saveNow(true);
      else await waitForIdle();
    },
    toast,
  );
  useEffect(() => {
    const stop = listen<{ names: Record<string, string> }>(
      "quickmd:directory-changed",
      (event) => {
        const names = event.payload.names;
        const active = activeFileRef.current;
        if (active && names[active]) {
          activeFileRef.current = names[active];
          setCurrentFile(names[active], contentRef.current);
          const previous = contentRef.current;
          const newName = names[active];
          loadNote(newName)
            .then((text) => {
              if (
                activeFileRef.current === newName &&
                contentRef.current === previous &&
                !isDirty()
              ) {
                setContent(text);
                setCurrentFile(newName, text);
              }
            })
            .catch((e) => toast(String(e)));
        }
        setPinned((previous) => {
          const next = new Set(Array.from(previous, (n) => names[n] || n));
          localStorage.setItem("quickmd-pinned", JSON.stringify([...next]));
          return next;
        });
        loadNotes();
      },
    );
    const reloadPins = () => {
      try {
        setPinned(
          new Set(JSON.parse(localStorage.getItem("quickmd-pinned") || "[]")),
        );
      } catch {}
    };
    window.addEventListener("quickmd:pins-updated", reloadPins);
    return () => {
      stop.then((fn) => fn());
      window.removeEventListener("quickmd:pins-updated", reloadPins);
    };
  }, [loadNotes]);

  // ── Show float window ─────────────────────────────────────
  const handleShowFloat = useCallback(async () => {
    try {
      const floatWin = await WebviewWindow.getByLabel("float");
      if (!floatWin) return;
      await floatWin.unminimize().catch(() => {});
      await floatWin.show().catch(() => {});
      await floatWin.setFocus().catch(() => {});
    } catch (err) {
      console.error("[Main] showFloat:", err);
    }
  }, []);

  // ── Archive receiver (float → main) ───────────────────────
  useArchiveReceiver({
    isLoadingRef,
    setContent,
    setCurrentFile,
    loadNotes,
    onError: toast,
    openNote,
  });

  // ── To-float sender (main → float) ─────────────────────────
  const { handleToFloat: sendToFloat } = useToFloatSender({
    contentRef,
    activeFileRef,
    saveNow,
    getCurrentFile,
    onError: toast,
  });
  const handleToFloat = (fileName?: string) =>
    runOperation(() => sendToFloat(fileName));

  // ── External modification detection ────────────────────────
  const handleReloadRequest = useCallback(
    async (fileName: string, newContent: string) => {
      if (fileName !== activeFileRef.current || isDirty()) return;
      setCurrentFile(fileName, newContent);
      isLoadingRef.current = true;
      setContent(newContent);
      isLoadingRef.current = false;
      toast("检测到外部修改，已自动加载最新内容");
    },
    [setContent, toast],
  );

  useExternalChangeDetector({
    activeFile,
    contentRef,
    isDirty: saveStatus !== "saved",
    flushSave: saveNow,
    onReloadRequest: handleReloadRequest,
    flushOnFocusLost: autoSaveEnabled,
  });

  // ── Insert image ───────────────────────────────────────────
  const handleInsertImage = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        title: "选择图片",
        filters: [
          { name: "图片", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
        ],
      });
      if (!result) return;
      const relative = await importImage(result as string);
      editorRef.current?.replaceSelection(`\n![图片](${relative})\n`);
    } catch (e) {
      toast("选择图片失败");
    }
  }, [toast]);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="main-layout" ref={layoutRef}>
      <div className="main-body">
        <Sidebar
          notes={notes}
          activeFile={activeFile}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={openNote}
          onCreate={createNote}
          pinned={pinned}
          onTogglePin={handleTogglePin}
          onExport={handleExport}
          onRename={handleRename}
          onDelete={handleDelete}
          onCopyContent={handleCopyContent}
          onOpenInExplorer={handleOpenInExplorer}
          onToFloat={handleToFloat}
          onManageTags={(fileName) => {
            setTagEditorFile(fileName);
            setShowTagEditor(true);
          }}
          searching={searching}
          tagFilter={tagFilter}
          onTagFilter={setTagFilter}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
        <div className="main-editor-area">
          <div className="main-editor-toolbar" ref={toolbarRef}>
            <MdToolbar
              editorRef={editorRef}
              onInsertImage={handleInsertImage}
              disabled={viewMode === "preview" || operationBusy}
            />
            <span style={{ flex: 1 }} />
            <div className="editor-modebar">
              <button
                className={`mode-btn${viewMode === "code" ? " active" : ""}`}
                onClick={() => setViewMode("code")}
              >
                编辑
              </button>
              <button
                className={`mode-btn${viewMode === "preview" ? " active" : ""}`}
                onClick={() => setViewMode("preview")}
              >
                预览
              </button>
              <button
                className={`mode-btn${viewMode === "split" ? " active" : ""}`}
                onClick={() => setViewMode("split")}
              >
                分屏
              </button>
            </div>
            <div
              className="md-btn"
              role="button"
              tabIndex={0}
              title="浮窗"
              onClick={handleShowFloat}
            >
              <IconFloat />
            </div>
          </div>
          {showFindReplace && (
            <FindReplaceBar
              getContent={() => content}
              content={content}
              previewMode={viewMode === "preview"}
              onReplaceAll={(newContent) => {
                const ed = editorRef.current;
                if (!ed) return;
                ed.selectRange(0, ed.getContent().length);
                ed.replaceSelection(newContent);
              }}
              onSetHighlights={(h) => setFindHighlights(h)}
              onClearHighlights={() => setFindHighlights([])}
              onFindStateChange={(text, cs, idx) => {
                setFindText(text);
                setFindCaseSensitive(cs);
                setFindCurrentIdx(idx);
              }}
              getEditorElement={() =>
                document.querySelector<HTMLTextAreaElement>(
                  ".main-editor-body .code-editor-textarea",
                )
              }
              onClose={() => setShowFindReplace(false)}
            />
          )}
          <div
            className="main-editor-body"
            style={
              { "--split-ratio": `${splitRatio * 100}%` } as React.CSSProperties
            }
          >
            {viewMode !== "preview" && (
              <CodeEditor
                ref={editorRef}
                content={content}
                readOnly={operationBusy}
                onChange={handleContentChange}
                onScroll={viewMode === "split" ? handleCodeScroll : undefined}
                placeholder="开始写点东西…"
                highlights={showFindReplace ? findHighlights : []}
              />
            )}
            {viewMode === "split" && (
              <div
                className="editor-split-divider"
                onMouseDown={handleDividerMouseDown}
              >
                <div className="split-divider-handle" />
              </div>
            )}
            {viewMode !== "code" && (
              <Preview
                content={content}
                scrollRatio={viewMode === "split" ? scrollRatio : undefined}
                onScrollChange={
                  viewMode === "split" ? handlePreviewScroll : undefined
                }
                highlightTerm={showFindReplace ? findText : undefined}
                highlightCaseSensitive={findCaseSensitive}
                highlightCurrentIdx={
                  showFindReplace ? findCurrentIdx : undefined
                }
              />
            )}
          </div>
        </div>
      </div>
      <StatusBar
        wordCount={wordCount}
        fileName={activeFile}
        hideEmpty={false}
        saveStatus={saveStatus}
        className="main-statusbar"
        onOpenSettings={() => setShowSettings(true)}
        saveError={saveError}
        onRetry={() => saveNow(true).catch(() => {})}
      />
      {toastKey > 0 && (
        <Toast
          key={toastKey}
          message={toastMsg}
          duration={3000}
          onDone={resetToast}
        />
      )}
      {showTagEditor && tagEditorFile && (
        <TagEditor
          fileName={tagEditorFile}
          tags={notes.find((n) => n.file_name === tagEditorFile)?.tags ?? []}
          onClose={() => {
            setShowTagEditor(false);
            setTagEditorFile(null);
          }}
          onTagsChanged={() => loadNotes()}
        />
      )}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          beforeDirectoryChange={async () => {
            await waitForOperation();
            await saveNow();
          }}
        />
      )}
    </div>
  );
}

export default MainWindow;
