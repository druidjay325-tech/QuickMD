import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./hooks/useTheme";
import "./styles/global.css";
import "./styles/refinement.css";
import "./styles/glass.css";
import { isTauri } from "@tauri-apps/api/core";
import { initializeLocale } from "./i18n";

async function bootstrap() {
  if (!isTauri()) {
    const { startBrowserDemo } = await import("./browserDemo");
    startBrowserDemo();
  }

  await initializeLocale();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
bootstrap();
