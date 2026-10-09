import { useState, useCallback, useRef, useEffect } from "react";
import "./FindReplaceBar.css";

interface FindReplaceBarProps {
  getContent: () => string;
  content: string;
  onReplaceAll: (newContent: string) => void;
  onSetHighlights?: (
    highlights: { start: number; end: number; isCurrent: boolean }[],
  ) => void;
  onClearHighlights?: () => void;
  getEditorElement?: () => HTMLTextAreaElement | null;
  onFindStateChange?: (
    text: string,
    caseSensitive: boolean,
    currentIdx: number,
  ) => void;
  previewMode?: boolean;
  onClose: () => void;
}

interface Match {
  start: number;
  end: number;
}

export function FindReplaceBar({
  getContent,
  content,
  onReplaceAll,
  onSetHighlights,
  onClearHighlights,
  getEditorElement,
  onFindStateChange,
  previewMode = false,
  onClose,
}: FindReplaceBarProps) {
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const findRef = useRef<HTMLInputElement>(null);
  const matchesRef = useRef<Match[]>([]);
  const currentIdxRef = useRef(-1);

  useEffect(() => {
    findRef.current?.focus();
  }, []);

  const onClearRef = useRef(onClearHighlights);
  onClearRef.current = onClearHighlights;
  useEffect(() => {
    return () => {
      onClearRef.current?.();
    };
  }, []);

  currentIdxRef.current = currentIdx;

  const getContentRef = useRef(getContent);
  getContentRef.current = getContent;
  const onSetHighlightsRef = useRef(onSetHighlights);
  onSetHighlightsRef.current = onSetHighlights;
  const onFindStateChangeRef = useRef(onFindStateChange);
  onFindStateChangeRef.current = onFindStateChange;
  const getEditorElementRef = useRef(getEditorElement);
  getEditorElementRef.current = getEditorElement;

  const computeMatches = useCallback((text: string, cs: boolean): Match[] => {
    const c = getContentRef.current();
    if (!text) return [];
    const result: Match[] = [];
    const flags = cs ? "g" : "gi";
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      const regex = new RegExp(escaped, flags);
      let m;
      while ((m = regex.exec(c)) !== null) {
        result.push({ start: m.index, end: m.index + m[0].length });
        if (m.index === regex.lastIndex) regex.lastIndex++;
      }
    } catch {}
    return result;
  }, []);

  // Update both edit highlights and preview state
  const updateAll = useCallback(
    (matches: Match[], idx: number, text: string, cs: boolean) => {
      matchesRef.current = matches;
      setMatchCount(matches.length);
      setCurrentIdx(idx);
      currentIdxRef.current = idx;

      // Edit path: mirror div highlights
      const highlights = matches.map((m, i) => ({
        start: m.start,
        end: m.end,
        isCurrent: i === idx,
      }));
      onSetHighlightsRef.current?.(highlights);

      // Preview path: notify parent for Preview highlightTerm + currentIdx
      onFindStateChangeRef.current?.(text, cs, idx);

      // Scroll editor to current match
      if (idx >= 0) {
        const el = getEditorElementRef.current?.();
        if (el) {
          const match = matches[idx];
          const before = el.value.substring(0, match.start);
          const lineCount = before.split("\n").length;
          const lineHeight =
            parseFloat(window.getComputedStyle(el).lineHeight) || 18;
          const targetTop = (lineCount - 1) * lineHeight;
          if (
            targetTop < el.scrollTop ||
            targetTop > el.scrollTop + el.clientHeight - lineHeight * 2
          ) {
            el.scrollTop = Math.max(0, targetTop - el.clientHeight / 3);
          }
        }
      }
    },
    [],
  );

  const handleFindChange = useCallback(
    (text: string) => {
      setFindText(text);
      const m = computeMatches(text, caseSensitive);
      const newIdx = m.length > 0 ? 0 : -1;
      updateAll(m, newIdx, text, caseSensitive);
    },
    [computeMatches, caseSensitive, updateAll],
  );

  const toggleCaseSensitive = useCallback(() => {
    const newCs = !caseSensitive;
    setCaseSensitive(newCs);
    const text = findRef.current?.value ?? "";
    const m = computeMatches(text, newCs);
    const newIdx = m.length > 0 ? 0 : -1;
    updateAll(m, newIdx, text, newCs);
  }, [caseSensitive, computeMatches, updateAll]);

  // Recompute on content change (edit, undo, etc.)
  useEffect(() => {
    if (!findText) return;
    const m = computeMatches(findText, caseSensitive);
    const newIdx =
      m.length > 0 ? Math.min(currentIdxRef.current, m.length - 1) : -1;
    updateAll(m, newIdx, findText, caseSensitive);
  }, [content, findText, caseSensitive, computeMatches, updateAll]);

  const goToMatch = useCallback(
    (idx: number) => {
      const matches = matchesRef.current;
      if (matches.length === 0) return;
      const wrapped =
        ((idx % matches.length) + matches.length) % matches.length;
      updateAll(matches, wrapped, findRef.current?.value ?? "", caseSensitive);
    },
    [updateAll, caseSensitive],
  );

  const goNext = useCallback(() => {
    goToMatch(currentIdxRef.current + 1);
  }, [goToMatch]);
  const goPrev = useCallback(() => {
    goToMatch(currentIdxRef.current - 1);
  }, [goToMatch]);

  const replaceCurrent = useCallback(() => {
    const matches = matchesRef.current;
    const idx = currentIdxRef.current;
    if (idx < 0 || idx >= matches.length) return;
    const c = getContentRef.current();
    const match = matches[idx];
    const newContent =
      c.substring(0, match.start) + replaceText + c.substring(match.end);
    onReplaceAll(newContent);
    setTimeout(() => {
      const m = computeMatches(findRef.current?.value ?? "", caseSensitive);
      const newIdx = m.length > 0 ? Math.min(idx, m.length - 1) : -1;
      updateAll(m, newIdx, findRef.current?.value ?? "", caseSensitive);
    }, 0);
  }, [replaceText, onReplaceAll, computeMatches, caseSensitive, updateAll]);

  const replaceAll = useCallback(() => {
    const matches = matchesRef.current;
    if (matches.length === 0) return;
    const confirmed = window.confirm(
      `将替换当前便利贴中的 ${matches.length} 处内容，确定？`,
    );
    if (!confirmed) return;
    const c = getContentRef.current();
    const flags = caseSensitive ? "g" : "gi";
    const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, flags);
    const newContent = c.replace(regex, () => replaceText);
    onReplaceAll(newContent);
    matchesRef.current = [];
    updateAll([], -1, "", caseSensitive);
  }, [
    findText,
    replaceText,
    caseSensitive,
    onReplaceAll,
    computeMatches,
    updateAll,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) goPrev();
        else goNext();
      }
    },
    [onClose, goNext, goPrev],
  );

  return (
    <div className="fr-bar" onKeyDown={handleKeyDown}>
      <div className="fr-row">
        {!previewMode && (
          <button
            className="fr-expand-btn"
            onClick={() => setShowReplace(!showReplace)}
            title={showReplace ? "收起替换" : "展开替换"}
          >
            {showReplace ? "▾" : "▸"}
          </button>
        )}
        {previewMode && <span className="fr-expand-spacer" />}
        <input
          ref={findRef}
          className="fr-input"
          type="text"
          placeholder="查找"
          value={findText}
          onChange={(e) => handleFindChange(e.target.value)}
        />
        <button
          className={`fr-chip${caseSensitive ? " active" : ""}`}
          onClick={toggleCaseSensitive}
          title="区分大小写"
        >
          Aa
        </button>
        <span className="fr-count">
          {findText ? `${currentIdx + 1}/${matchCount}` : ""}
        </span>
        <button
          className="fr-icon-btn"
          onClick={goPrev}
          disabled={matchCount === 0}
          title="上一个 (Shift+Enter)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          className="fr-icon-btn"
          onClick={goNext}
          disabled={matchCount === 0}
          title="下一个 (Enter)"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <button
          className="fr-icon-btn fr-close"
          onClick={onClose}
          title="关闭 (Esc)"
        >
          ×
        </button>
      </div>
      {showReplace && !previewMode && (
        <div className="fr-row">
          <span className="fr-expand-spacer" />
          <input
            className="fr-input"
            type="text"
            placeholder="替换为"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
          />
          <button
            className="fr-chip"
            onClick={replaceCurrent}
            disabled={currentIdx < 0}
            title="替换当前"
          >
            替换
          </button>
          <button
            className="fr-chip fr-chip-primary"
            onClick={replaceAll}
            disabled={matchCount === 0}
            title="全部替换"
          >
            全部替换
          </button>
        </div>
      )}
    </div>
  );
}
