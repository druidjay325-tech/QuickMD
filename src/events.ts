/**
 * Shared Tauri event constants and payload types.
 * One source of truth for inter-window communication.
 */

// ── Event names ─────────────────────────────────────────────

/** Float → Main: user clicks "移入档案" */
export const EVENT_ARCHIVE_REQUEST = "quickmd:archive-request";

/** Main → Float: user clicks "移入浮窗" from right-click menu */
export const EVENT_TO_FLOAT = "quickmd:to-float";

/** Accent color changed — broadcast to all windows */
export const EVENT_ACCENT_CHANGED = "quickmd:accent-changed";
export const EVENT_SETTINGS_CHANGED = "quickmd:settings-changed";
export const EVENT_GLASS_OPACITY_CHANGED = "quickmd:glass-opacity-changed";

export interface AccentChangedPayload {
  accent: string;
  hover: string;
}

// ── Payload types ───────────────────────────────────────────

/** Float archived buffer to flashthoughts/. Main window opens the file. */
export interface ArchivePayload {
  /** Final filename in flashthoughts/ (after uniqueness check by Rust) */
  archivedFileName: string;
}

/** Main → Float: send a note's content to float for editing. */
export interface ToFloatPayload {
  requestId: string;
  content: string;
  fileName: string; // source note's filename (for float title bar)
}
