import { useState, useEffect } from "react";
import { SaveStatusIcon } from "./SaveStatusIcon";
import { IconSun, IconMoon, IconGear } from "./Icons";
import { useTheme, THEMES, THEME_LABELS } from "../hooks/useTheme";
import {
  COLOR_PRESETS,
  getAccentColor,
  saveAccentColor,
} from "./editor/SettingsModal";
import { listen } from "@tauri-apps/api/event";
import { EVENT_ACCENT_CHANGED } from "../events";

interface StatusBarProps {
  wordCount: number;
  fileName: string | null;
  hideEmpty: boolean;
  saveStatus: string;
  className?: string;
  onOpenSettings?: () => void;
  showDropHint?: boolean;
  saveError?: string;
  onRetry?: () => void;
}

export function StatusBar({
  wordCount,
  fileName,
  saveStatus,
  saveError,
  onRetry,
  className = "",
  onOpenSettings,
  showDropHint = true,
}: StatusBarProps) {
  const { theme, toggle } = useTheme();
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const themeActionLabel = `当前为${THEME_LABELS[theme]}主题，点击切换为${THEME_LABELS[nextTheme]}主题`;
  const [accent, setAccent] = useState(
    () => getAccentColor()?.accent ?? COLOR_PRESETS[0].accent,
  );

  // Listen for cross-window accent changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ accent: string }>(EVENT_ACCENT_CHANGED, (e) => {
      setAccent(e.payload.accent);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const cycleAccent = () => {
    const idx = COLOR_PRESETS.findIndex((p) => p.accent === accent);
    const next = COLOR_PRESETS[(idx + 1) % COLOR_PRESETS.length];
    saveAccentColor(next.accent, next.hover);
    setAccent(next.accent); // immediate UI update
  };

  return (
    <div className={`statusbar ${className}`}>
      <span className="float-statusbar-left">
        {wordCount} 字
        {showDropHint && (
          <span className="drop-hint"> · {fileName || "拖入 .md 文件"}</span>
        )}
      </span>
      <div className="statusbar-spacer" />
      <button
        className="accent-cycle"
        onClick={cycleAccent}
        title="切换主题色"
        style={{ background: accent }}
      />
      <button
        type="button"
        className="theme-toggle"
        onClick={toggle}
        title={themeActionLabel}
        aria-label={themeActionLabel}
      >
        <span aria-hidden="true">
          {theme === "dark" ? (
            <IconMoon />
          ) : theme === "light" ? (
            <IconSun />
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <rect x="3" y="3" width="13" height="13" rx="3" />
              <rect x="8" y="8" width="13" height="13" rx="3" />
            </svg>
          )}
        </span>
      </button>
      {onOpenSettings && (
        <button className="theme-toggle" onClick={onOpenSettings} title="设置">
          <IconGear />
        </button>
      )}
      <span className="float-statusbar-right">
        <button
          type="button"
          onClick={saveStatus === "error" ? onRetry : undefined}
          className={`save-status ${saveStatus}`}
          title={
            saveError ||
            (saveStatus === "saved" ? "内容已安全保存" : "等待保存")
          }
          aria-live="polite"
        >
          <span aria-hidden="true">
            <SaveStatusIcon status={saveStatus} />
          </span>
          <span>
            {saveStatus === "saved"
              ? !fileName && wordCount === 0
                ? "准备记录"
                : "已保存"
              : saveStatus === "saving"
                ? "保存中"
                : saveStatus === "error"
                  ? "保存失败 · 重试"
                  : "未保存"}
          </span>
        </button>
      </span>
    </div>
  );
}
