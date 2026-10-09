import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  getWindowMaterial,
  setWindowGlass,
  type MaterialStatus,
} from "../commands";
import { EVENT_GLASS_OPACITY_CHANGED, EVENT_ACCENT_CHANGED } from "../events";

export type Theme = "dark" | "light" | "glass";
export const DEFAULT_THEME: Theme = "glass";
export const DEFAULT_GLASS_OPACITY = 22;
const GLASS_OPACITY_KEY = "quickmd-glass-opacity";
export const THEMES: readonly Theme[] = ["dark", "light", "glass"];
export const THEME_LABELS: Record<Theme, string> = {
  dark: "深色",
  light: "浅色",
  glass: "毛玻璃",
};
export function isTheme(value: unknown): value is Theme {
  return THEMES.includes(value as Theme);
}
interface ThemeCtx {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
  glassOpacity: number;
  setGlassOpacity: (opacity: number) => void;
  materialStatus: MaterialStatus | null;
  materialError: string | null;
}
const ctx = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggle: () => {},
  glassOpacity: DEFAULT_GLASS_OPACITY,
  setGlassOpacity: () => {},
  materialStatus: null,
  materialError: null,
});
function readAccent(): string {
  try {
    const value = JSON.parse(
      localStorage.getItem("quickmd-accent-color") || "null",
    )?.accent;
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
      return value;
  } catch {}
  return "#527ac7";
}
function readGlassOpacity(): number {
  try {
    const raw = localStorage.getItem(GLASS_OPACITY_KEY);
    if (raw !== null) {
      const value = Number(raw);
      if (Number.isFinite(value))
        return Math.round(Math.max(0, Math.min(100, value)));
    }
  } catch {}
  return DEFAULT_GLASS_OPACITY;
}
function readTheme(): Theme {
  try {
    const value = localStorage.getItem("quickmd-theme");
    if (isTheme(value)) return value;
  } catch {}
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [glassOpacity, setGlassOpacityState] = useState(readGlassOpacity);
  const [accent, setAccent] = useState(readAccent);
  const [materialStatus, setMaterialStatus] = useState<MaterialStatus | null>(
    null,
  );
  const [materialError, setMaterialError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    listen<{ accent: unknown }>(EVENT_ACCENT_CHANGED, (event) => {
      if (
        typeof event.payload.accent === "string" &&
        /^#[0-9a-f]{6}$/i.test(event.payload.accent)
      )
        setAccent(event.payload.accent);
    })
      .then((fn) => {
        if (disposed) fn();
        else stop = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  const current = useRef(theme);
  current.current = theme;
  const nativeQueue = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  useEffect(() => {
    if (theme !== "glass") return;
    let disposed = false,
      inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const status = await getWindowMaterial();
        if (
          disposed ||
          !status?.enabled ||
          status.engine !== "DesktopAcrylicController"
        )
          return;
        setMaterialStatus(status);
        document.documentElement.dataset.nativeGlass = "true";
        setMaterialError(
          status.state === 0
            ? null
            : "系统策略正在使用实色替代材质，调节值已保留。",
        );
      } catch {
      } finally {
        inFlight = false;
      }
    };
    const first = setTimeout(refresh, 250),
      timer = setInterval(refresh, 1500);
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [theme]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--glass-body-opacity", `${glassOpacity}%`);
    root.style.setProperty(
      "--glass-sidebar-opacity",
      `${Math.min(100, glassOpacity + 8)}%`,
    );
    root.style.setProperty(
      "--glass-chrome-opacity",
      `${Math.max(0, glassOpacity - 4)}%`,
    );
    try {
      localStorage.setItem(GLASS_OPACITY_KEY, String(glassOpacity));
    } catch {}
  }, [glassOpacity]);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    listen<{ opacity: unknown }>(EVENT_GLASS_OPACITY_CHANGED, (event) => {
      const value = event.payload.opacity;
      if (typeof value === "number" && Number.isFinite(value)) {
        setGlassOpacityState(Math.round(Math.max(0, Math.min(100, value))));
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else stop = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme =
      theme === "light" ? "light" : "dark";
    try {
      localStorage.setItem("quickmd-theme", theme);
    } catch {}
    const request = ++revision.current;
    nativeQueue.current = nativeQueue.current
      .catch(() => {})
      .then(async () => {
        if (request !== revision.current) return;
        try {
          const status = await setWindowGlass(
            theme === "glass",
            theme !== "light",
            glassOpacity,
            accent,
          );
          if (request !== revision.current) return;
          const native =
            status?.engine === "DesktopAcrylicController" && status.enabled;
          document.documentElement.dataset.nativeGlass = String(native);
          document.documentElement.dataset.materialUnavailable = "false";
          setMaterialStatus(status ?? null);
          setMaterialError(
            native && status.state !== 0
              ? "系统策略正在使用实色替代材质，调节值已保留。"
              : null,
          );
        } catch (error) {
          if (request !== revision.current) return;
          document.documentElement.dataset.nativeGlass = "false";
          document.documentElement.dataset.materialUnavailable = String(
            theme === "glass",
          );
          setMaterialStatus(null);
          setMaterialError(theme === "glass" ? String(error) : null);
        }
      })
      .catch(() => {});
  }, [theme, glassOpacity, accent]);
  useEffect(() => {
    let disposed = false;
    let stop: (() => void) | undefined;
    listen<{ theme: unknown }>("quickmd:theme-changed", (event) => {
      if (isTheme(event.payload.theme)) {
        current.current = event.payload.theme;
        setThemeState(event.payload.theme);
      }
    })
      .then((fn) => {
        if (disposed) fn();
        else stop = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
  // 只在用户选择时广播，接收同步时不回发。
  const setTheme = useCallback((next: Theme) => {
    if (!isTheme(next)) return;
    current.current = next;
    setThemeState(next);
    emit("quickmd:theme-changed", { theme: next }).catch(() => {});
  }, []);
  const toggle = useCallback(() => {
    setTheme(THEMES[(THEMES.indexOf(current.current) + 1) % THEMES.length]);
  }, [setTheme]);
  const setGlassOpacity = useCallback((value: number) => {
    if (!Number.isFinite(value)) return;
    const opacity = Math.round(Math.max(0, Math.min(100, value)));
    setGlassOpacityState(opacity);
    emit(EVENT_GLASS_OPACITY_CHANGED, { opacity }).catch(() => {});
  }, []);
  return (
    <ctx.Provider
      value={{
        theme,
        setTheme,
        toggle,
        glassOpacity,
        setGlassOpacity,
        materialStatus,
        materialError,
      }}
    >
      {children}
    </ctx.Provider>
  );
}
export function useTheme() {
  return useContext(ctx);
}
