/**
 * Type-safe IPC wrappers for all Tauri commands.
 *
 * Every `invoke(...)` in the app goes through this file.
 * 参数与返回值在此统一声明，命令对应关系由构建和集成回归验证。
 */
import { invoke } from "@tauri-apps/api/core";
import type { NoteInfo } from "./components/sidebar/Sidebar";
export interface MaterialStatus {
  engine: string;
  enabled: boolean;
  opacity: number;
  tintOpacity: number | null;
  luminosityOpacity: number | null;
  state: number | null;
  tintColor: number[] | null;
}
export async function getWindowMaterial(): Promise<MaterialStatus> {
  return invoke("get_window_material");
}
export async function setWindowGlass(
  enabled: boolean,
  dark: boolean,
  opacity: number,
  accent: string,
): Promise<MaterialStatus> {
  return invoke("set_window_glass", { enabled, dark, opacity, accent });
}
export async function reportRuntimeReady(): Promise<void> {
  return invoke("runtime_ready");
}

export async function createNote(
  fileName: string,
  content = "",
): Promise<string> {
  return invoke("create_note", { fileName, content });
}
export async function replaceBuffer(
  content: string,
  oldTitle: string,
): Promise<string | null> {
  return invoke("replace_buffer", { content, oldTitle });
}
export async function resolveImage(path: string): Promise<string> {
  return invoke("resolve_image", { path });
}
export async function importImage(path: string): Promise<string> {
  return invoke("import_image", { path });
}
export async function openExternalLink(url: string): Promise<void> {
  return invoke("open_external_link", { url });
}
export async function finishExit(): Promise<void> {
  return invoke("finish_exit");
}
export async function searchNotes(query: string): Promise<NoteInfo[]> {
  return invoke("search_notes", { query });
}

/* ── Flashthoughts CRUD ─────────────────────────────────── */

/** Load a note's raw markdown content. Throws "NOT_FOUND" if the file doesn't exist. */
export async function loadNote(filePath: string): Promise<string> {
  return invoke("load_note", { filePath });
}

/** Save (create or overwrite) a note in flashthoughts/. */
export async function saveNote(
  filePath: string,
  content: string,
  expectedContent?: string,
): Promise<void> {
  return invoke("save_note", { filePath, content, expectedContent });
}

/** Delete a note from flashthoughts/. */
export async function deleteNote(fileName: string): Promise<void> {
  return invoke("delete_note", { fileName });
}

/** Rename a note file. */
export async function renameNote(
  oldName: string,
  newName: string,
): Promise<void> {
  return invoke("rename_note", { oldName, newName });
}

/** List all notes with metadata (name, modified time, size). */
export async function listNotes(): Promise<NoteInfo[]> {
  return invoke("list_notes");
}

/** Get the flashthoughts directory path (for display in settings). */
export async function getFlashthoughtsDirPath(): Promise<string> {
  return invoke("get_flashthoughts_dir_path");
}

/* ── Export / File ──────────────────────────────────────── */

/** Open save dialog and export note content to a user-chosen path. Returns the chosen path or null. */
export async function exportNote(
  content: string,
  suggestedName: string,
): Promise<string | null> {
  return invoke("export_note", { content, suggestedName });
}

/** Open Windows Explorer with the note file selected. */
export async function openInExplorer(fileName: string): Promise<void> {
  return invoke("open_in_explorer", { fileName });
}

/** Read any file by absolute path (used for drag-drop import). */
export async function readFileAbsolute(filePath: string): Promise<string> {
  return invoke("read_file_absolute", { path: filePath });
}

/* ── Tags ───────────────────────────────────────────────── */

/** Get all tags (filename → tags map) */
export async function getAllTags(): Promise<Record<string, string[]>> {
  return invoke("get_all_tags");
}

/** Set tags for a specific note */
export async function setTags(fileName: string, tags: string[]): Promise<void> {
  return invoke("set_tags", { fileName, tags });
}

/* ── Float buffer ───────────────────────────────────────── */
// Buffer = single fixed file (.float-buffer/buffer.md).
// Title is pure UI state, not stored on disk.

/** Inspect float buffer — returns content if buffer.md exists, null otherwise. */
export async function inspectBuffer(): Promise<string | null> {
  return invoke("inspect_buffer");
}

/** Write content to float buffer (always buffer.md). */
export async function saveBuffer(
  content: string,
  expectedContent?: string,
): Promise<void> {
  return invoke("save_buffer", { content, expectedContent });
}

/** Clear the float buffer (delete buffer.md). */
export async function clearBuffer(): Promise<void> {
  return invoke("clear_buffer");
}

/** Archive buffer to flashthoughts/ with given title (filename).
 *  Returns the final filename (may differ on conflict). */
export async function archiveBuffer(title: string): Promise<string> {
  return invoke("archive_buffer", { title });
}

/* ── Settings ───────────────────────────────────────────── */

export interface AppSettings {
  autostart: boolean;
  shortcut: string;
  custom_dir?: string | null;
  auto_save: boolean;
}

/** Get current settings */
export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

/** Save settings (autostart + shortcut + autoSave). Triggers shortcut re-registration in Rust. */
export async function saveAppSettings(
  autostart: boolean,
  shortcut: string,
  autoSave: boolean,
): Promise<void> {
  return invoke("save_app_settings", { autostart, shortcut, autoSave });
}

/** Set custom flashthoughts directory. Creates flashthoughts/ subdir and migrates files.
 *  Pass null to reset to default. Returns the new flashthoughts path. */
export async function setCustomDir(path: string | null): Promise<string> {
  return invoke("set_custom_dir", { path });
}
