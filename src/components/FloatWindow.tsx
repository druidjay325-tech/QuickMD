import { tr, useLocale, displayMessage } from "../i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { useAutoSave } from "../hooks/useAutoSave";
import { useExternalChangeDetector } from "../hooks/useExternalChangeDetector";
import { useFileDrop } from "../hooks/useFileDrop";
import { useImageInsert } from "../hooks/useImageInsert";
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

const defaultTitle = () => tr("ui.quickNote");
const INVALID_CHARS = /[\\/:*?"<>|]/g;

function sanitizeTitle(title: string): string {
  return title.replace(INVALID_CHARS, "").trim();
}

// ── Watermark ─────────────────────────────────────────────────────────────

const WATERMARK_QUOTES = [
  tr("ui.writeItDownItDoesNotNeedToBe"),
  tr("ui.aShortNoteCanSaveAGoodIdea"),
  tr("ui.ideasPassQuicklyCatchThisOne"),
  tr("ui.everyNoteIsASeed"),
  tr("ui.captureItNowBringItToLifeLater"),
  tr("ui.aQuietPlaceForWhateverIsOnYourMind"),
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
    return { kind: "greeting", text: tr("ui.goodMorningWhatIsOnYourMind") };
  }
  if ((h >= 17 || h < 5) && !s.evening) {
    s.evening = true;
    save();
    return { kind: "greeting", text: tr("ui.aQuietNightForANewIdea") };
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
  const locale = useLocale();

  const editorRef = useRef<CodeEditorHandle | null>(null);
  const contentRef = useRef("");
  const contentRevision = useRef(0);
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
  const titleIsAutomatic = useRef(
    localStorage.getItem("quickmd-buffer-title-kind") === "automatic" ||
      !localStorage.getItem("quickmd-buffer-title"),
  );
  const [displayTitle, setDisplayTitle] = useState(
    () => localStorage.getItem("quickmd-buffer-title") || defaultTitle(),
  );
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  useEffect(() => {
    localStorage.setItem("quickmd-buffer-title", displayTitle);
    localStorage.setItem(
      "quickmd-buffer-title-kind",
      titleIsAutomatic.current ? "automatic" : "custom",
    );
  }, [displayTitle]);
  useEffect(() => {
    if (titleIsAutomatic.current && !isEditingTitle)
      setDisplayTitle(defaultTitle());
  }, [locale, isEditingTitle]);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleBackupRef = useRef(defaultTitle());

  // ── View mode (编辑 / 预览) ────────────────────────────────
  const [viewMode, setViewMode] = useState<"code" | "preview">("code");
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findHighlights, setFindHighlights] = useState<
    { start: number; end: number; isCurrent: boolean }[]
  >([]);

  const wordCount = countWords(content);

  // ── Auto-save settings ─────────────────────────────────────
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [currentShortcut, setCurrentShortcut] = useState("Alt+Q");

  useEffect(() => {
    getSettings()
      .then((s) => {
        setAutoSaveEnabled(s.auto_save);
        setCurrentShortcut(s.shortcut);
      })
      .catch(() => {});
    const unlisten = listen(EVENT_SETTINGS_CHANGED, () => {
      getSettings()
        .then((s) => {
          setAutoSaveEnabled(s.auto_save);
          setCurrentShortcut(s.shortcut);
        })
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
      contentRevision.current++;
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
      contentRevision.current++;
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

  // ── Toast / images / file drop ─────────────────────────────
  const [toastMsg, setToastMsg] = useState("");
  const [toastKey, setToastKey] = useState(0);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastKey((k) => k + 1);
  }, []);
  const { insertImages, waitForImages } = useImageInsert({
    editorRef,
    getContext: () => contentRevision.current,
    canInsert: () => !transactionRef.current && !restoring && !restoreError,
    isPreview: () => viewMode === "preview",
    toast,
  });
  useFileDrop({
    onImageDrop: insertImages,
    onFileDrop: async (droppedContent, fileName) => {
      if (transactionRef.current || restoring || restoreError) {
        toast(tr("ui.theScratchpadIsBusyTryDroppingTheFileAgain"));
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
          toast(tr("ui.youEditedTheDraftDuringImportYourChangesAre"));
          return;
        }
        if (archived)
          await emit(EVENT_ARCHIVE_REQUEST, { archivedFileName: archived });
        contentRevision.current++;
        contentRef.current = droppedContent;
        isLoadingRef.current = true;
        setContentState(droppedContent);
        titleIsAutomatic.current = false;
        setDisplayTitle(sanitizeTitle(fileName.replace(/\.(md|txt)$/, "")));
        setCurrentFile(null, droppedContent);
        isLoadingRef.current = false;
      } catch (e) {
        console.error("[Float] file drop failed:", e);
        toast(tr("ui.couldNotImportTheFile"));
      } finally {
        setBusy(false);
      }
    },
    onError: (message) => toast(message),
    onUnsupportedFile: () => {
      toast(tr("images.supportedDrops"));
    },
  });

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
    titleIsAutomatic.current = !cleaned;
    setDisplayTitle(cleaned || defaultTitle());
    setIsEditingTitle(false);
  }, []);

  const cancelTitle = useCallback(() => {
    setDisplayTitle(titleBackupRef.current);
    setIsEditingTitle(false);
  }, []);

  // ── Archive ────────────────────────────────────────────────
  const handleArchive = useCallback(async () => {
    await waitForImages();
    if (transactionRef.current) return;
    const content = contentRef.current;
    if (!content || !content.trim()) {
      toast(tr("ui.thereIsNothingToArchive"));
      return;
    }

    setBusy(true);
    try {
      // 1. Force-save current content to buffer.md
      await saveNow(true);

      // 2. Determine filename
      let fileName: string;
      if (displayTitle === defaultTitle() || !displayTitle.trim()) {
        // Default title → suggest date-based name, let user confirm/change
        const dateName = getDailyFileName().replace(/\.md$/, "");
        const result = await openInputModal({
          title: tr("ui.archiveNote"),
          label: tr("ui.fileName"),
          defaultValue: dateName,
          confirmText: tr("ui.archive"),
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
        toast(tr("ui.archivedAsToAvoidANameConflict", { v0: finalName }));
      }

      // 6. Reset float to clean state
      contentRevision.current++;
      contentRef.current = "";
      setContentState("");
      titleIsAutomatic.current = true;
      setDisplayTitle(defaultTitle());
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
    await waitForImages();
    if (transactionRef.current) return;
    if (!contentRef.current.trim()) return;
    const decision = await openConfirmDialog({
      title: tr("ui.clearThisDraft"),
      message: tr("ui.archiveItFirstToKeepThisThought"),
      buttons: [
        { text: tr("ui.clear"), value: "clear", primary: true },
        { text: tr("ui.cancel"), value: "cancel" },
      ],
    });
    if (decision !== "clear") return;
    setBusy(true);
    try {
      await saveNow();
      await waitForIdle();
      await clearBuffer();
      contentRevision.current++;
      contentRef.current = "";
      setContentState("");
      titleIsAutomatic.current = true;
      setDisplayTitle(defaultTitle());
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
      contentRevision.current++;
      contentRef.current = text;
      setContentState(text);
    },
    getTitle: () => displayTitle,
    getContent: () => contentRef.current,
    isBusy: () => transactionRef.current || restoring || !!restoreError,
    setBusy,
    onReceive: (fileName, incoming) => {
      titleIsAutomatic.current = false;
      setDisplayTitle(
        sanitizeTitle(fileName.replace(/\.md$/, "")) || defaultTitle(),
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
        toast(tr("ui.theLibraryWindowIsNotAvailable"));
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
      await waitForImages();
      await waitTransaction();
      if (isDirty()) await saveNow(true);
      else await waitForIdle();
    },
    toast,
  );
  const hideSafely = async () => {
    try {
      await waitForImages();
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
        waitForImages()
          .then(() => saveNow(true))
          .catch(() => {});
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
            title={tr("ui.clickToEditTheTitle")}
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
            {tr("ui.edit")}
          </button>
          <button
            className={`mode-btn${viewMode === "preview" ? " active" : ""}`}
            onClick={() => setViewMode("preview")}
          >
            {tr("ui.preview")}
          </button>
        </div>
        <span className="float-toolbar-actions">
          <button
            className="swap-btn"
            onClick={handleClear}
            disabled={transaction || !content || !content.trim()}
            title={tr("ui.clear")}
          >
            <IconTrash />
          </button>
          <button
            className="swap-btn"
            onClick={handleArchive}
            disabled={!content || !content.trim()}
            title={tr("ui.archive")}
            aria-label={tr("ui.archive")}
          >
            <IconArchive />
          </button>
          <button
            className="swap-btn"
            onClick={handleShowMain}
            title={tr("ui.openLibrary")}
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
                    <p>{tr("ui.captureAThoughtHere")}</p>
                    <p>
                      {tr("float.shortcutHint", { shortcut: currentShortcut })}
                    </p>
                    <p>
                      <span className="wm-icon">
                        <IconMaximize />
                      </span>{" "}
                      {tr("ui.openYourLibrary")}
                    </p>
                    <p>{tr("float.dropFileHint")}</p>
                    <p>{tr("ui.clickTheTitleToChangeItsArchiveName")}</p>
                  </>
                ) : (
                  <p>{displayMessage(wmData.text)}</p>
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
