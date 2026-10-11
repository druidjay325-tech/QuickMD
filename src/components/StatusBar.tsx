import { tr, useLocale, displayMessage } from "../i18n";
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
import { migrateAccent } from "../utils/accent";

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
  useLocale();

  const { theme, toggle } = useTheme();
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  const themeActionLabel = tr("ui.currentThemeSwitchTo", {
    v0: THEME_LABELS[theme],
    v1: THEME_LABELS[nextTheme],
  });
  const [accent, setAccent] = useState(
    () => getAccentColor()?.accent ?? COLOR_PRESETS[0].accent,
  );

  // Listen for cross-window accent changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ accent: string }>(EVENT_ACCENT_CHANGED, (e) => {
      setAccent(migrateAccent(e.payload.accent, "").accent);
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
      <span className="float-statusbar-left" title={tr("stats.countHelp")}>
        {tr("stats.count", { count: wordCount })}
        {showDropHint && (
          <span className="drop-hint">
            {" "}
            · {fileName || tr("ui.dropAMdFile")}
          </span>
        )}
      </span>
      <div className="statusbar-spacer" />
      <button
        className="accent-cycle"
        onClick={cycleAccent}
        title={tr("ui.changeAccentColor")}
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
        <button
          className="theme-toggle"
          onClick={onOpenSettings}
          title={tr("ui.settings")}
        >
          <IconGear />
        </button>
      )}
      <span className="float-statusbar-right">
        <button
          type="button"
          onClick={saveStatus === "error" ? onRetry : undefined}
          className={`save-status ${saveStatus}`}
          title={
            (saveError ? displayMessage(saveError) : "") ||
            (saveStatus === "saved"
              ? tr("ui.yourContentIsSaved")
              : tr("ui.waitingToSave"))
          }
          aria-live="polite"
        >
          <span aria-hidden="true">
            <SaveStatusIcon status={saveStatus} />
          </span>
          <span>
            {saveStatus === "saved"
              ? !fileName && wordCount === 0
                ? tr("ui.readyToWrite")
                : tr("ui.saved")
              : saveStatus === "saving"
                ? tr("ui.saving")
                : saveStatus === "error"
                  ? tr("ui.saveFailedRetry")
                  : tr("ui.unsaved")}
          </span>
        </button>
      </span>
    </div>
  );
}
