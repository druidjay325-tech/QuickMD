import { tr } from "../i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";

let latestRevision = 0;
let titleUpdate = Promise.resolve();

/** 标题跟随当前文件；原生请求串行执行，避免快速切换时旧标题后到。 */
export function updateMainWindowTitle(fileName: string | null): void {
  const title = fileName?.replace(/\.md$/i, "") || tr("ui.quickmdQuickNotes");
  const revision = ++latestRevision;
  document.title = title;

  titleUpdate = titleUpdate.then(async () => {
    if (revision !== latestRevision) return;
    try {
      await getCurrentWindow().setTitle(title);
    } catch {
      // 纯浏览器没有原生窗口，document.title 仍可用于预览和确认。
    }
  });
}
