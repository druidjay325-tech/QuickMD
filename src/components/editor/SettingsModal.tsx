import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getSettings,
  saveAppSettings,
  getFlashthoughtsDirPath,
  setCustomDir as setCustomDirCmd,
} from "../../commands";
import { open } from "@tauri-apps/plugin-dialog";
import { emit } from "@tauri-apps/api/event";
import { EVENT_ACCENT_CHANGED, EVENT_SETTINGS_CHANGED } from "../../events";
import "./SettingsModal.css";
import { applyAccent } from "../../utils/accent";
import { useModalFocus } from "../useModalFocus";
import { flushOtherWindow } from "../../hooks/useWindowLifecycle";
import { useTheme } from "../../hooks/useTheme";

/* ── Theme color presets ──────────────────────────────────── */

export const COLOR_PRESETS = [
  { name: "雾蓝", accent: "#527ac7", hover: "#4268b2" },
  { name: "松绿", accent: "#39745a", hover: "#2f634c" },
  { name: "琥珀", accent: "#f59e0b", hover: "#f7b32b" },
  { name: "翠绿", accent: "#10b981", hover: "#34d399" },
  { name: "玫红", accent: "#ec4899", hover: "#f472b6" },
];

const ACCENT_STORAGE_KEY = "quickmd-accent-color";

export function getAccentColor(): { accent: string; hover: string } | null {
  const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function applyAccentColor(accent: string, hover: string) {
  applyAccent(accent, hover);
}

export function saveAccentColor(accent: string, hover: string) {
  localStorage.setItem(ACCENT_STORAGE_KEY, JSON.stringify({ accent, hover }));
  applyAccentColor(accent, hover);
  // Broadcast to all windows (float window is a separate WebView)
  emit(EVENT_ACCENT_CHANGED, { accent, hover }).catch(() => {});
}

interface NativeSettings {
  shortcut: string;
  autostart: boolean;
  auto_save: boolean;
}

function parseShortcut(s: string): { mod1: string; mod2: string; key: string } {
  const parts = s.split("+");
  const key = parts.pop() || "Q";
  const mod2 = parts.length > 1 ? parts.pop()! : "None";
  const mod1 = parts.pop() || "Alt";
  return { mod1, mod2, key };
}

function formatShortcut(mod1: string, mod2: string, key: string): string {
  const parts = [mod1];
  if (mod2 !== "None") parts.push(mod2);
  parts.push(key);
  return parts.join("+");
}

const MODIFIERS = ["Ctrl", "Alt", "Shift"] as const;
const MODIFIERS_WITH_NONE = ["None", "Ctrl", "Alt", "Shift"] as const;
const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  .split("")
  .concat("F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12".split(" "));

export default function SettingsModal({
  onClose,
  beforeDirectoryChange,
}: {
  onClose: () => void;
  beforeDirectoryChange?: () => Promise<void>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const { glassOpacity, setGlassOpacity, materialError } = useTheme();
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<NativeSettings | null>(null);
  const desired = useRef<NativeSettings | null>(null);
  const confirmed = useRef<NativeSettings | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  const saveError = useRef<string | null>(null);
  const mounted = useRef(false);
  const [saving, setSaving] = useState(false);
  const [currentDir, setCurrentDir] = useState("");
  const [customDir, setCustomDirPath] = useState<string | null>(null);
  const { mod1, mod2, key } = parseShortcut(settings?.shortcut ?? "Alt+Q");
  const autoSave = settings?.auto_save ?? true;
  const autostart = settings?.autostart ?? false;
  const closeSettings = useCallback(async () => {
    const previousError = saveError.current;
    let pending: Promise<void>;
    do {
      pending = saveQueue.current;
      await pending;
    } while (pending !== saveQueue.current);
    // 关闭时若刚发生保存失败，先保留面板展示错误；再次关闭可离开。
    if (saveError.current && saveError.current !== previousError) return;
    onClose();
  }, [onClose]);
  useModalFocus(card, closeSettings);

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    getSettings()
      .then(
        (s: {
          shortcut: string;
          autostart: boolean;
          custom_dir?: string | null;
          auto_save?: boolean;
        }) => {
          if (disposed) return;
          const loaded = {
            shortcut: s.shortcut,
            autostart: s.autostart,
            auto_save: s.auto_save ?? true,
          };
          desired.current = confirmed.current = loaded;
          setSettings(loaded);
          setCustomDirPath(s.custom_dir ?? null);
        },
      )
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    // Load current flashthoughts dir path
    getFlashthoughtsDirPath()
      .then((path) => {
        if (!disposed) setCurrentDir(path);
      })
      .catch(() => {});
    return () => {
      disposed = true;
      mounted.current = false;
    };
  }, []);

  const currentShortcut = settings?.shortcut ?? "Alt+Q";

  // Mutual exclusion: mod2 can't repeat mod1, key can't be a modifier
  const availableMod2 = useMemo(
    () => MODIFIERS_WITH_NONE.filter((m) => m === "None" || m !== mod1),
    [mod1],
  );

  const updateSettings = useCallback((patch: Partial<NativeSettings>) => {
    if (!desired.current) return;
    const next = { ...desired.current, ...patch };
    const request = ++revision.current;
    desired.current = next;
    saveError.current = null;
    setSettings(next);
    setSaving(true);
    setError("");
    // 不节流用户改动；串行落盘，未启动的旧快照由最新完整设置替代。
    saveQueue.current = saveQueue.current
      .catch(() => {})
      .then(async () => {
        if (request !== revision.current) return;
        try {
          await saveAppSettings(next.autostart, next.shortcut, next.auto_save);
          confirmed.current = next;
          emit(EVENT_SETTINGS_CHANGED, {}).catch(() => {});
        } catch (e) {
          if (request === revision.current) {
            desired.current = confirmed.current;
            saveError.current = `设置保存失败，已恢复之前的选项：${String(e)}`;
            if (mounted.current) {
              setSettings(confirmed.current);
              setError(saveError.current);
            }
          }
        } finally {
          if (request === revision.current && mounted.current) setSaving(false);
        }
      });
  }, []);
  const changeShortcut = (part: "mod1" | "mod2" | "key", value: string) => {
    if (!desired.current) return;
    const next = { ...parseShortcut(desired.current.shortcut), [part]: value };
    if (next.mod1 === next.mod2) next.mod2 = "None";
    updateSettings({
      shortcut: formatShortcut(next.mod1, next.mod2, next.key),
    });
  };

  return (
    <div className="settings-overlay" onClick={closeSettings}>
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-busy={saving}
        aria-label="设置"
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-header">
          <h2>设置</h2>
          <button
            className="settings-close"
            onClick={closeSettings}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="settings-body">
          {/* Autostart */}
          <div className="settings-row">
            <label className="settings-label">开机自启动</label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                aria-label="开机自启动"
                checked={autostart}
                disabled={!settings}
                onChange={(e) =>
                  updateSettings({ autostart: e.target.checked })
                }
              />
              <span className="toggle-slider" />
            </label>
          </div>

          {/* Auto-save */}
          <div className="settings-row">
            <label className="settings-label">自动保存</label>
            <label className="settings-toggle">
              <input
                type="checkbox"
                aria-label="自动保存"
                checked={autoSave}
                disabled={!settings}
                onChange={(e) =>
                  updateSettings({ auto_save: e.target.checked })
                }
              />
              <span className="toggle-slider" />
            </label>
          </div>
          {!autoSave && (
            <div className="settings-preview">
              关闭后可用 <code>Ctrl+S</code> 手动保存
            </div>
          )}

          {/* Shortcut */}
          <div className="settings-row">
            <label className="settings-label">全局快捷键</label>
            <div className="shortcut-picker">
              <select
                aria-label="快捷键首修饰键"
                disabled={!settings}
                value={mod1}
                onChange={(e) => changeShortcut("mod1", e.target.value)}
              >
                {MODIFIERS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <span className="shortcut-plus">+</span>
              <select
                aria-label="快捷键第二修饰键"
                disabled={!settings}
                value={mod2}
                onChange={(e) => changeShortcut("mod2", e.target.value)}
              >
                {availableMod2.map((m) => (
                  <option key={m} value={m}>
                    {m === "None" ? "无" : m}
                  </option>
                ))}
              </select>
              <span className="shortcut-plus">+</span>
              <select
                aria-label="快捷键按键"
                disabled={!settings}
                value={key}
                onChange={(e) => changeShortcut("key", e.target.value)}
              >
                {KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="settings-preview">
            当前快捷键：<code>{currentShortcut}</code>
          </div>

          <div className="settings-opacity">
            <div className="settings-row">
              <label className="settings-label" htmlFor="glass-opacity">
                毛玻璃不透明度
              </label>
              <output htmlFor="glass-opacity">{glassOpacity}%</output>
            </div>
            <input
              id="glass-opacity"
              type="range"
              min="0"
              max="100"
              step="1"
              value={glassOpacity}
              onChange={(e) => setGlassOpacity(Number(e.target.value))}
            />
            <p className="settings-preview">
              联动调节实际材质的染色层与亮度层；菜单和设置页保持固定不透明度。
            </p>
            {materialError && (
              <p className="settings-error" role="alert">
                {materialError}
              </p>
            )}
          </div>

          {/* Flashthoughts directory */}
          <div className="settings-row settings-row-top">
            <label className="settings-label">便利贴存档位置</label>
            <button
              className="settings-btn settings-btn-idle"
              onClick={async () => {
                try {
                  const selected = await open({
                    directory: true,
                    multiple: false,
                  });
                  if (selected && typeof selected === "string") {
                    await beforeDirectoryChange?.();
                    await flushOtherWindow("float");
                    const newPath = await setCustomDirCmd(selected);
                    setCurrentDir(newPath);
                    setCustomDirPath(selected);
                  }
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              更改
            </button>
          </div>
          <div className="settings-dir-display">
            <code className="settings-dir-path">{currentDir}</code>
          </div>
          {customDir && (
            <div className="settings-dir-actions">
              <button
                className="settings-btn settings-btn-idle"
                onClick={async () => {
                  try {
                    await beforeDirectoryChange?.();
                    await flushOtherWindow("float");
                    const newPath = await setCustomDirCmd(null);
                    setCurrentDir(newPath);
                    setCustomDirPath(null);
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                恢复默认
              </button>
            </div>
          )}
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
