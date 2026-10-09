import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { useAutoSave } from "../hooks/useAutoSave";
import { useExternalChangeDetector } from "../hooks/useExternalChangeDetector";
import { useFileDrop } from "../hooks/useFileDrop";
import { useToFloatReceiver } from "../hooks/useToFloatReceiver";
import {
  inspectBuffer,
  replaceBuffer,
  clearBuffer,
  archiveBuffer,
  getSettings,
} from "../commands";
import { useWindowLifecycle } from "../hooks/useWindowLifecycle";
import { openConfirmDialog } from "./ConfirmDialog";
import { openInputModal } from "./InputModal";
import { FindReplaceBar } from "./editor/FindReplaceBar";
import { countWords, getDailyFileName } from "../utils/wordCount";
import {
  EVENT_ARCHIVE_REQUEST,
  type ArchivePayload,
  EVENT_SETTINGS_CHANGED,
} from "../events";
import CodeEditor from "./editor/CodeEditor";
import type { CodeEditorHandle } from "./editor/CodeEditor";
import Preview from "./editor/Preview";
import { IconArchive, IconMaximize, IconTrash } from "./Icons";
import { StatusBar } from "./StatusBar";
import { Toast } from "./Toast";
import "../styles/float.css";

const DEFAULT_TITLE = "闪念";
const INVALID_CHARS = /[\\/:*?"<>|]/g;

function sanitizeTitle(title: string): string {
  return title.replace(INVALID_CHARS, "").trim();
}

// ── Watermark ─────────────────────────────────────────────────────────────

const WATERMARK_QUOTES = [
  "想到什么就写下来，不必急着让它完美。",
  "好记性不如烂笔头。",
  "想法转瞬即逝，先抓住它。",
  "每一条便利贴，都是一颗种子。",
  "先记下来，一个一个实现。",
  "这里很安静，写什么都行。",
];

type WmKind = "tutorial" | "greeting" | "quote";

function pickWatermark(): { kind: WmKind; text: string } {
  if (!localStorage.getItem("float-tutorial-seen")) {
    localStorage.setItem("float-tutorial-seen", "1");
    return { kind: "tutorial", text: "" };
  }

  const now = new Date();
  const h = now.getHours();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  interface WmState {
    date: string;
    last: string;
    morning: boolean;
    evening: boolean;
  }
  let s: WmState = { date: "", last: "", morning: false, evening: false };
  try {
    const raw = localStorage.getItem("float-wm-state");
    if (raw) s = JSON.parse(raw);
  } catch {}

  if (s.date !== today)
    s = { date: today, last: "", morning: false, evening: false };
  const save = () => localStorage.setItem("float-wm-state", JSON.stringify(s));

  if (h >= 5 && h < 10 && !s.morning) {
    s.morning = true;
    save();
    return { kind: "greeting", text: "早安，今天想记点什么？" };
  }
  if ((h >= 17 || h < 5) && !s.evening) {
    s.evening = true;
    save();
    return { kind: "greeting", text: "夜深了，别错过每一个奇思妙想" };
  }

  const pool = WATERMARK_QUOTES.filter((q) => q !== s.last);
  const picked =
    pool[Math.floor(Math.random() * pool.length)] || WATERMARK_QUOTES[0];
  s.last = picked;
  save();
  return { kind: "quote", text: picked };
}

/** Wake a target window — show, unminimize, focus */
async function wakeWindow(label: string) {
  try {
    const win = await WebviewWindow.getByLabel(label);
    if (!win) return;
    await win.unminimize().catch(() => {});
    await win.show().catch(() => {});
    await win.setFocus().catch(() => {});
  } catch {
    /* window may not exist yet */
  }
}

function FloatWindow() {
  const editorRef = useRef<CodeEditorHandle | null>(null);
  const contentRef = useRef("");
  const isLoadingRef = useRef(false);
  const [transaction, setTransaction] = useState(false);
  const transactionRef = useRef(false);
  const waiters = useRef<Array<() => void>>([]);
  const setBusy = (busy: boolean) => {
    transactionRef.current = busy;
    setTransaction(busy);
    if (!busy) {
      waiters.current.forEach((resolve) => resolve());
      waiters.current = [];
    }
  };
  const waitTransaction = () =>
    transactionRef.current
      ? new Promise<void>((resolve) => waiters.current.push(resolve))
      : Promise.resolve();
  const [content, setContentState] = useState("");

  // ── Title (editable) ───────────────────────────────────────
  const [displayTitle, setDisplayTitle] = useState(
    () => localStorage.getItem("quickmd-buffer-title") || DEFAULT_TITLE,
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  useEffect(() => {
    localStorage.setItem("quickmd-buffer-title", displayTitle);
  }, [displayTitle]);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleBackupRef = useRef(DEFAULT_TITLE);

  // ── View mode (编辑 / 预览) ────────────────────────────────
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findHighlights, setFindHighlights] = useState<
    { start: number; end: number; isCurrent: boolean }[]
  >([]);

  const wordCount = countWords(content);

  // ── Auto-save settings ─────────────────────────────────────
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

  // ── Auto-save (always buffer mode) ─────────────────────────
  const {
    saveStatus,
    saveError,
    waitForIdle,
    isDirty,
    currentFile,
    setCurrentFile,
    setMode,
    scheduleSave,
    saveNow,
    reset: resetAutoSave,
  } = useAutoSave({ getContent: () => contentRef.current, autoSaveEnabled });

  // Float is ALWAYS in buffer mode — no daily mode, no file creation in flashthoughts/
  useEffect(() => {
    setMode("buffer");
  }, [setMode]);

  const currentFileRef = useRef(currentFile);
  currentFileRef.current = currentFile;

  // ── Auto-save on change ────────────────────────────────────
  const handleContentChange = useCallback(
    (newContent: string) => {
      contentRef.current = newContent;
      setContentState(newContent);
      if (!isLoadingRef.current) scheduleSave();
    },
    [scheduleSave],
  );

  // ── Init: restore buffer if any ────────────────────────────
  const [restoring, setRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const restoreRequest = useRef(0);
  const restoreDraft = useCallback(async () => {
    const request = ++restoreRequest.current;
    setRestoring(true);
    try {
      const buffered = await inspectBuffer();
      if (request !== restoreRequest.current) return;
      contentRef.current = buffered || "";
      isLoadingRef.current = true;
      setContentState(buffered || "");
      setCurrentFile(null, buffered || "");
      isLoadingRef.current = false;
      setRestoreError("");
    } catch (e) {
      if (request === restoreRequest.current) setRestoreError(String(e));
    } finally {
      if (request === restoreRequest.current) setRestoring(false);
    }
  }, [setCurrentFile]);
  useEffect(() => {
    restoreDraft();
    return () => {
      restoreRequest.current++;
    };
  }, [restoreDraft]);

  // ── File drop ──────────────────────────────────────────────
  useFileDrop({
    onFileDrop: async (droppedContent, fileName) => {
      if (transactionRef.current || restoring || restoreError) {
        toast("浮窗正在处理，请稍后拖入");
        return;
      }
      setBusy(true);
      try {
        await saveNow();
        const previous = contentRef.current;
        const archived = await replaceBuffer(
          droppedContent,
          displayTitle + ".md",
        );
        if (previous !== contentRef.current) {
          await saveNow(true);
          toast("导入期间有新的编辑，草稿已保留，请再次拖入");
          return;
        }
        if (archived)
          await emit(EVENT_ARCHIVE_REQUEST, { archivedFileName: archived });
        contentRef.current = droppedContent;
        isLoadingRef.current = true;
        setContentState(droppedContent);
        setDisplayTitle(sanitizeTitle(fileName.replace(/\.(md|txt)$/, "")));
        setCurrentFile(null, droppedContent);
        isLoadingRef.current = false;
      } catch (e) {
        console.error("[Float] file drop failed:", e);
        toast("拖入失败");
      } finally {
        setBusy(false);
      }
    },
    onError: (message) => toast(message),
    onUnsupportedFile: () => {
      toast(`仅支持 .md 和 .txt 文件`);
    },
  });

  // ── Toast ──────────────────────────────────────────────────
  const [toastMsg, setToastMsg] = useState("");
  const [toastKey, setToastKey] = useState(0);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastKey((k) => k + 1);
  }, []);

  // ── Title editing ──────────────────────────────────────────
  const startEditTitle = useCallback(() => {
    titleBackupRef.current = displayTitle;
    setIsEditingTitle(true);
  }, [displayTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const confirmTitle = useCallback(() => {
    const input = titleInputRef.current?.value ?? "";
    const cleaned = sanitizeTitle(input);
    setDisplayTitle(cleaned || DEFAULT_TITLE);
    setIsEditingTitle(false);
  }, []);

  const cancelTitle = useCallback(() => {
    setDisplayTitle(titleBackupRef.current);
    setIsEditingTitle(false);
  }, []);

  // ── Archive ────────────────────────────────────────────────
  const handleArchive = useCallback(async () => {
    if (transactionRef.current) return;
    const content = contentRef.current;
    if (!content || !content.trim()) {
      toast("没有内容可归档");
      return;
    }

    setBusy(true);
    try {
      // 1. Force-save current content to buffer.md
      await saveNow(true);

      // 2. Determine filename
      let fileName: string;
      if (displayTitle === DEFAULT_TITLE || !displayTitle.trim()) {
        // Default title → suggest date-based name, let user confirm/change
        const dateName = getDailyFileName().replace(/\.md$/, "");
        const result = await openInputModal({
          title: "归档便利贴",
          label: "文件名",
          defaultValue: dateName,
          confirmText: "归档",
        });
        if (!result) return; // user cancelled
        fileName = sanitizeTitle(result) + ".md";
      } else {
        fileName = sanitizeTitle(displayTitle) + ".md";
      }

      // 3. Archive: Rust reads buffer.md, writes to flashthoughts/, returns final name
      const finalName = await archiveBuffer(fileName);

      // 4. Notify main window
      await wakeWindow("main");
      const payload: ArchivePayload = { archivedFileName: finalName };
      await emit(EVENT_ARCHIVE_REQUEST, payload);

      // 5. Toast if renamed
      if (finalName !== fileName) {
        toast(`已归档（重名改为 ${finalName}）`);
      }

      // 6. Reset float to clean state
      contentRef.current = "";
      setContentState("");
      setDisplayTitle(DEFAULT_TITLE);
      resetAutoSave();
      setMode("buffer");
    } catch (err) {
      console.error("[Archive]", err);
      toast(String(err));
    } finally {
      setBusy(false);
    }
  }, [displayTitle, saveNow, toast, resetAutoSave, setMode]);

  // ── Clear (discard buffer) ─────────────────────────────────
  const handleClear = useCallback(async () => {
    if (transactionRef.current) return;
    if (!contentRef.current.trim()) return;
    const decision = await openConfirmDialog({
      title: "清空当前草稿？",
      message: "先归档可以保留这份想法。",
      buttons: [
        { text: "清空", value: "clear", primary: true },
        { text: "取消", value: "cancel" },
      ],
    });
    if (decision !== "clear") return;
    setBusy(true);
    try {
      await saveNow();
      await waitForIdle();
      await clearBuffer();
      contentRef.current = "";
      setContentState("");
      setDisplayTitle(DEFAULT_TITLE);
      resetAutoSave();
      setMode("buffer");
    } catch (err) {
      console.error("[Clear]", err);
      toast(String(err));
    } finally {
      setBusy(false);
    }
  }, [toast, resetAutoSave, setMode]);

  // ── To-float receiver (13a) ────────────────────────────────
  useToFloatReceiver({
    isLoadingRef,
    saveNow,
    setContent: (text) => {
      contentRef.current = text;
      setContentState(text);
    },
    getTitle: () => displayTitle,
    getContent: () => contentRef.current,
    isBusy: () => transactionRef.current || restoring || !!restoreError,
    setBusy,
    onReceive: (fileName, incoming) => {
      setDisplayTitle(
        sanitizeTitle(fileName.replace(/\.md$/, "")) || DEFAULT_TITLE,
      );
      setCurrentFile(null, incoming);
    },
    onError: toast,
  });

  // ── External change detection (flush on focus lost only when autoSave on) ───
  useExternalChangeDetector({
    activeFile: null,
    contentRef,
    isDirty: saveStatus !== "saved",
    flushSave: saveNow,
    onReloadRequest: () => {},
    flushOnFocusLost: autoSaveEnabled,
  });

  // ── Watermark ──────────────────────────────────────────────
  type WmData = { kind: WmKind; text: string };
  const [wmData, setWmData] = useState<WmData | null>(() => pickWatermark());
  const wasEmpty = useRef(true);

  useEffect(() => {
    if (!content) {
      if (!wasEmpty.current) setWmData(pickWatermark());
      wasEmpty.current = true;
    } else {
      wasEmpty.current = false;
    }
  }, [content]);

  // ── Show main window ───────────────────────────────────────
  const handleShowMain = useCallback(async () => {
    try {
      const mainWin = await WebviewWindow.getByLabel("main");
      if (!mainWin) {
        toast("主窗口未打开");
        return;
      }
      await mainWin.unminimize().catch(() => {});
      await mainWin.show().catch(() => {});
      await mainWin.setFocus().catch(() => {});
    } catch (err) {
      console.error("[Float] showMain:", err);
    }
  }, [toast]);

  useWindowLifecycle(
    "float",
    async () => {
      await waitTransaction();
      if (isDirty()) await saveNow(true);
      else await waitForIdle();
    },
    toast,
  );
  const hideSafely = async () => {
    try {
      await waitTransaction();
      await saveNow();
      await getCurrentWindow().hide();
    } catch (e) {
      toast(String(e));
    }
  };
  // ── ESC / Ctrl+S ──────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showFindReplace) {
          setShowFindReplace(false);
          return;
        }
        if (isEditingTitle) {
          cancelTitle();
          return;
        }
        if (viewMode === "preview") {
          setViewMode("code");
          return;
        }
        // Save before hide (always, even if autoSave is off)
        hideSafely();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveNow(true).catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [viewMode, isEditingTitle, cancelTitle]);

  return (
    <div className="float-window">
      <div className="float-toolbar">
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            className="float-title-input"
            type="text"
            defaultValue={displayTitle}
            onBlur={confirmTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmTitle();
              if (e.key === "Escape") {
                e.preventDefault();
                cancelTitle();
              }
            }}
          />
        ) : (
          <span
            className="float-title"
            onClick={startEditTitle}
            title="点击编辑标题"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startEditTitle();
              }
            }}
          >
            {displayTitle}
          </span>
        )}
        <div className="float-modebar">
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
        </div>
        <span className="float-toolbar-actions">
          <button
            className="swap-btn"
            onClick={handleClear}
            disabled={transaction || !content || !content.trim()}
            title="清空"
          >
            <IconTrash />
          </button>
          <button
            className="swap-btn"
            onClick={handleArchive}
            disabled={!content || !content.trim()}
            title="归档"
            aria-label="归档"
          >
            <IconArchive />
          </button>
          <button
            className="swap-btn"
            onClick={handleShowMain}
            title="打开主窗"
          >
            <IconMaximize />
          </button>
        </span>
      </div>
      <div className="float-editor">
        {showFindReplace && viewMode === "code" && (
          <FindReplaceBar
            getContent={() => editorRef.current?.getContent() ?? ""}
            content={content}
            onReplaceAll={(newContent) => {
              const ed = editorRef.current;
              if (!ed) return;
              ed.selectRange(0, ed.getContent().length);
              ed.replaceSelection(newContent);
            }}
            onSetHighlights={(h) => setFindHighlights(h)}
            onClearHighlights={() => setFindHighlights([])}
            getEditorElement={() =>
              document.querySelector<HTMLTextAreaElement>(
                ".float-editor .code-editor-textarea",
              )
            }
            onClose={() => setShowFindReplace(false)}
          />
        )}
        {viewMode === "code" ? (
          <>
            {!content && wmData && (
              <div className="float-watermark" aria-hidden="true">
                {wmData.kind === "tutorial" ? (
                  <>
                    <p>在此写下闪念</p>
                    <p>
                      <code>Alt+Q</code> 呼出 / 隐藏浮窗
                    </p>
                    <p>
                      <span className="wm-icon">
                        <IconMaximize />
                      </span>{" "}
                      打开主窗（便利贴档案）
                    </p>
                    <p>
                      拖入 <code>.md</code> 文件到此处编辑
                    </p>
                    <p>点击标题可编辑，归档时以此命名</p>
                  </>
                ) : (
                  <p>{wmData.text}</p>
                )}
              </div>
            )}
            <CodeEditor
              ref={editorRef}
              content={content}
              readOnly={transaction || restoring || !!restoreError}
              onChange={handleContentChange}
              placeholder=""
              highlights={showFindReplace ? findHighlights : []}
            />
          </>
        ) : (
          <Preview content={content} />
        )}
      </div>
      <StatusBar
        wordCount={wordCount}
        fileName={null}
        hideEmpty={false}
        saveStatus={restoreError ? "error" : saveStatus}
        saveError={restoreError || saveError}
        onRetry={() =>
          restoreError ? restoreDraft() : saveNow(true).catch(() => {})
        }
        className="float-statusbar"
        showDropHint={false}
      />
      {toastKey > 0 && (
        <Toast
          key={toastKey}
          message={toastMsg}
          duration={3000}
          onDone={() => setToastKey(0)}
        />
      )}
    </div>
  );
}

export default FloatWindow;
