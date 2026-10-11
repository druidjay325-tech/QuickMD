import { tr, useLocale, displayMessage } from "../../i18n";
import { useState, useCallback, useRef } from "react";
import { useModalFocus } from "../useModalFocus";
import { setTags } from "../../commands";
import "./TagEditor.css";

interface TagEditorProps {
  fileName: string;
  tags: string[];
  onClose: () => void;
  onTagsChanged: () => void;
}

export function TagEditor({
  fileName,
  tags: initialTags,
  onClose,
  onTagsChanged,
}: TagEditorProps) {
  useLocale();

  const [tags, setTagsState] = useState<string[]>(initialTags);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const busy = useRef(false);
  const card = useRef<HTMLDivElement>(null);
  useModalFocus(card, onClose);

  const addTag = useCallback(async () => {
    const tag = input.trim();
    if (!tag || tags.includes(tag)) {
      setInput("");
      return;
    }
    const next = [...tags, tag];
    if (busy.current) return;
    busy.current = true;
    try {
      await setTags(fileName, next);
      setTagsState(next);
      setInput("");
      setError("");
      onTagsChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      busy.current = false;
    }
  }, [input, tags, fileName, onTagsChanged]);

  const removeTag = useCallback(
    async (tag: string) => {
      const next = tags.filter((t) => t !== tag);
      if (busy.current) return;
      busy.current = true;
      try {
        await setTags(fileName, next);
        setTagsState(next);
        setError("");
        onTagsChanged();
      } catch (e) {
        setError(String(e));
      } finally {
        busy.current = false;
      }
    },
    [tags, fileName, onTagsChanged],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [addTag, onClose],
  );

  return (
    <div className="tag-editor-overlay" onClick={onClose}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={tr("ui.manageTags")}
        className="tag-editor"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tag-editor-header">
          {tr("ui.manageTags")}
          <button
            className="tag-editor-close"
            onClick={onClose}
            title={tr("ui.close")}
            aria-label={tr("ui.close")}
          >
            ×
          </button>
        </div>
        <div className="tag-editor-list">
          {tags.map((tag) => (
            <span key={tag} className="tag-editor-tag">
              #{tag}
              <button
                className="tag-editor-remove"
                onClick={() => removeTag(tag)}
              >
                ×
              </button>
            </span>
          ))}
          {tags.length === 0 && (
            <span className="tag-editor-empty">{tr("ui.noTagsYet")}</span>
          )}
        </div>
        <div className="tag-editor-input-row">
          <input
            className="tag-editor-input"
            placeholder={tr("ui.enterATagAndPressEnter")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button className="tag-editor-add" onClick={addTag}>
            {tr("ui.add")}
          </button>
        </div>
        {error && (
          <p className="settings-error" role="alert">
            {displayMessage(error)}
          </p>
        )}
      </div>
    </div>
  );
}
