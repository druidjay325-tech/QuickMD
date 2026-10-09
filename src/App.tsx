import { useEffect } from "react";
import { reportRuntimeReady } from "./commands";
import { applyAccent } from "./utils/accent";
import { listen } from "@tauri-apps/api/event";
import { getWindowLabel } from "./window";
import FloatWindow from "./components/FloatWindow";
import MainWindow from "./components/MainWindow";
import {
  COLOR_PRESETS,
  getAccentColor,
} from "./components/editor/SettingsModal";
import { EVENT_ACCENT_CHANGED, type AccentChangedPayload } from "./events";

function App() {
  useEffect(() => {
    reportRuntimeReady().catch(() => {});
  }, []);
  const label = getWindowLabel();

  // Restore saved accent color on startup + listen for cross-window changes
  useEffect(() => {
    const saved = getAccentColor() ?? COLOR_PRESETS[0];
    applyAccent(saved.accent, saved.hover);
    const unlisten = listen<AccentChangedPayload>(EVENT_ACCENT_CHANGED, (e) => {
      applyAccent(e.payload.accent, e.payload.hover);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  if (label === "float") {
    return <FloatWindow />;
  }

  return <MainWindow />;
}

export default App;
