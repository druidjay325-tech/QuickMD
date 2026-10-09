import {
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle,
  useState,
  useMemo,
} from "react";
import "./CodeEditor.css";
import { EditorContextMenu } from "./EditorContextMenu";

export interface CodeEditorHandle {
  getContent: () => string;
  setContent: (text: string) => void;
  getScrollRatio: () => number;
  setScrollRatio: (ratio: number) => void;
  getSelection: () => { start: number; end: number; text: string };
  replaceSelection: (text: string) => void;
  selectRange: (start: number, end: number) => void;
  focus: () => void;
}

interface CodeEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  onScroll?: (ratio: number) => void;
  /** Find highlights — passed as prop, not via imperative handle */
  highlights?: { start: number; end: number; isCurrent: boolean }[];
}

const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(
  function CodeEditor(
    {
      content,
      onChange,
      placeholder,
      readOnly = false,
      onScroll,
      highlights = [],
    }: CodeEditorProps,
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      getContent: () => textareaRef.current?.value ?? "",
      setContent: (text: string) => {
        if (textareaRef.current && textareaRef.current.value !== text) {
          textareaRef.current.value = text;
        }
      },
      getScrollRatio: () => {
        const el = textareaRef.current;
        if (!el) return 0;
        const max = el.scrollHeight - el.clientHeight;
        return max > 0 ? el.scrollTop / max : 0;
      },
      setScrollRatio: (ratio: number) => {
        const el = textareaRef.current;
        if (!el) return;
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = Math.max(0, Math.round(ratio * max));
      },
      getSelection: () => {
        const el = textareaRef.current;
        if (!el) return { start: 0, end: 0, text: "" };
        return {
          start: el.selectionStart,
          end: el.selectionEnd,
          text: el.value.substring(el.selectionStart, el.selectionEnd),
        };
      },
      replaceSelection: (text: string) => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        document.execCommand("insertText", false, text);
        onChange(el.value);
      },
      selectRange: (start: number, end: number) => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(start, end);
      },
      focus: () => textareaRef.current?.focus(),
    }));

    // Render highlights into mirror div (driven by state, auto-runs on change)
    // Build mirror content as React elements (declarative, no innerHTML)
    const mirrorContent = useMemo(() => {
      if (highlights.length === 0) return null;
      const text = content;
      const sorted = [...highlights].sort((a, b) => a.start - b.start);
      const parts: React.ReactNode[] = [];
      let lastEnd = 0;
      for (let i = 0; i < sorted.length; i++) {
        const h = sorted[i];
        if (h.start > lastEnd) {
          parts.push(
            <span key={`t${i}`}>{text.substring(lastEnd, h.start)}</span>,
          );
        }
        parts.push(
          <mark
            key={`m${i}`}
            className={`find-highlight${h.isCurrent ? " find-highlight-current" : ""}`}
          >
            {text.substring(h.start, h.end)}
          </mark>,
        );
        lastEnd = h.end;
      }
      if (lastEnd < text.length) {
        parts.push(<span key="end">{text.substring(lastEnd)}</span>);
      }
      return parts;
    }, [highlights, content]);

    // Sync mirror scroll with textarea
    const syncMirrorScroll = useCallback(() => {
      const mirror = mirrorRef.current;
      const el = textareaRef.current;
      if (!mirror || !el) return;
      mirror.scrollTop = el.scrollTop;
    }, []);

    // Sync external content changes back to textarea
    useEffect(() => {
      const el = textareaRef.current;
      if (el && el.value !== content) {
        const pos = el.selectionStart;
        el.value = content;
        if (pos <= content.length) {
          el.selectionStart = el.selectionEnd = pos;
        }
      }
    }, [content]);

    const handleInput = useCallback(() => {
      const el = textareaRef.current;
      if (el) onChange(el.value);
    }, [onChange]);

    const handleScroll = useCallback(() => {
      syncMirrorScroll();
      const el = textareaRef.current;
      if (!el || !onScroll) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) onScroll(el.scrollTop / max);
    }, [onScroll, syncMirrorScroll]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key !== "Tab") return;
        e.preventDefault();
        const el = textareaRef.current;
        if (!el) return;

        const start = el.selectionStart;
        const end = el.selectionEnd;
        const value = el.value;

        if (start === end) {
          document.execCommand("insertText", false, "    ");
          onChange(el.value);
          return;
        }

        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const selectedText = value.substring(lineStart, end);
        const lines = selectedText.split("\n");

        if (e.shiftKey) {
          const dedented = lines.map((line) => {
            let removed = 0;
            while (removed < 4 && line[removed] === " ") removed++;
            return line.substring(removed);
          });
          const newText = dedented.join("\n");
          el.focus();
          el.setSelectionRange(lineStart, end);
          document.execCommand("insertText", false, newText);
          const diff = selectedText.length - newText.length;
          el.setSelectionRange(lineStart, end - diff);
        } else {
          const indented = lines.map((line) => "    " + line);
          const newText = indented.join("\n");
          el.focus();
          el.setSelectionRange(lineStart, end);
          document.execCommand("insertText", false, newText);
          const diff = newText.length - selectedText.length;
          el.setSelectionRange(lineStart, end + diff);
        }
        onChange(el.value);
      },
      [onChange],
    );

    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(
      null,
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      },
      [],
    );

    return (
      <div className="code-editor">
        <div className="code-editor-mirror" ref={mirrorRef} aria-hidden="true">
          {mirrorContent}
        </div>
        <textarea
          readOnly={readOnly}
          aria-label="便利贴正文"
          ref={textareaRef}
          className="code-editor-textarea"
          placeholder={placeholder}
          defaultValue={content}
          onInput={handleInput}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
          spellCheck={false}
        />
        {ctxMenu && (
          <EditorContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            onClose={() => setCtxMenu(null)}
            onCut={() => {
              const el = textareaRef.current;
              if (!el) return;
              const sel = el.value.substring(
                el.selectionStart,
                el.selectionEnd,
              );
              navigator.clipboard.writeText(sel).then(() => {
                document.execCommand("delete");
                onChange(el.value);
              });
            }}
            onCopy={() => {
              const el = textareaRef.current;
              if (!el) return;
              const sel = el.value.substring(
                el.selectionStart,
                el.selectionEnd,
              );
              navigator.clipboard.writeText(sel);
            }}
            onPaste={async () => {
              const el = textareaRef.current;
              if (!el) return;
              el.focus();
              try {
                const text = await navigator.clipboard.readText();
                document.execCommand("insertText", false, text);
                onChange(el.value);
              } catch {}
            }}
            onSelectAll={() => {
              const el = textareaRef.current;
              if (!el) return;
              el.focus();
              el.select();
            }}
          />
        )}
      </div>
    );
  },
);

export default CodeEditor;
