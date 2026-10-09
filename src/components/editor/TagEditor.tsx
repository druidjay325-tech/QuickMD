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
        aria-label="标签管理"
        className="tag-editor"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tag-editor-header">
          标签管理
          <button className="tag-editor-close" onClick={onClose} title="关闭">
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
            <span className="tag-editor-empty">暂无标签</span>
          )}
        </div>
        <div className="tag-editor-input-row">
          <input
            className="tag-editor-input"
            placeholder="输入标签名，回车添加..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button className="tag-editor-add" onClick={addTag}>
            添加
          </button>
        </div>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
