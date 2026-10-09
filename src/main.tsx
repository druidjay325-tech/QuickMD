import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "./hooks/useTheme";
import "./styles/global.css";
import "./styles/refinement.css";
import "./styles/glass.css";
import { isTauri } from "@tauri-apps/api/core";

async function bootstrap() {
  if (!isTauri()) {
    const { startBrowserDemo } = await import("./browserDemo");
    startBrowserDemo();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </React.StrictMode>,
  );
}
bootstrap();
