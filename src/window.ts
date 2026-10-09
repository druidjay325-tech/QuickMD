import { getCurrentWindow } from "@tauri-apps/api/window";

export type WindowLabel = "main" | "float";

export function getWindowLabel(): WindowLabel {
  try {
    const label = getCurrentWindow().label;
    return label === "float" ? "float" : "main";
  } catch {
    return "main";
  }
}
