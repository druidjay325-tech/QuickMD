/** 纯浏览器预览仅使用内存。该适配器不访问用户的磁盘档案。 */
import {
  mockIPC,
  mockWindows,
  mockConvertFileSrc,
} from "@tauri-apps/api/mocks";
import welcome from "../WELCOME_CONTENT.md?raw";
import guide from "../MD_GUIDE_CONTENT.md?raw";
export function startBrowserDemo() {
  (window as any).__QUICKMD_BROWSER__ = true;
  document.documentElement.dataset.preview = "true";
  mockWindows(
    new URLSearchParams(location.search).get("window") === "float"
      ? "float"
      : "main",
    "main",
    "float",
  );
  mockConvertFileSrc("windows");
  const notes = new Map<string, string>([
    ["SOUL.md", welcome],
    ["Markdown 语法指南.md", guide],
    [
      "让想法有个落点.md",
      "# 让想法有个落点\n\n不必等一个完整的计划。先记下一句话，再慢慢让它生长。\n\n## 今天的闪念\n\n- [ ] 写下一个值得追逐的想法\n- [ ] 留一点时间给自己\n- [x] 把注意力带回眼前\n\n> 简单，安静，始终在手边。\n",
    ],
    ["周末去看看山.md", "# 周末去看看山\n\n带一本书，找一处阴凉。\n"],
    ["关于下一个作品.md", "# 关于下一个作品\n\n让每次使用都更轻松一点。"],
  ]);
  let buffer = "";
  let settings = {
    autostart: false,
    shortcut: "Alt+Q",
    auto_save: true,
    custom_dir: null,
  };
  const tags: Record<string, string[]> = {
    "让想法有个落点.md": ["日常"],
    "关于下一个作品.md": ["灵感"],
  };
  const create = (name: string, text: string) => {
    let candidate = name;
    for (let i = 1; notes.has(candidate); i++)
      candidate = name.replace(/\.md$/, "-" + i + ".md");
    notes.set(candidate, text);
    return candidate;
  };
  const list = () =>
    Array.from(notes, ([file_name, text], i) => ({
      file_name,
      modified: Math.floor(Date.now() / 1000) - i * 7200,
      size: new TextEncoder().encode(text).length,
      tags: tags[file_name] || [],
    }));
  mockIPC(
    (cmd, args: any) => {
      switch (cmd) {
        case "set_window_glass":
          return {
            engine: "browser-preview",
            enabled: args.enabled,
            opacity: args.opacity,
            tintOpacity: null,
            luminosityOpacity: null,
            state: null,
            tintColor: null,
          };
        case "get_window_material":
          return {
            engine: "browser-preview",
            enabled: false,
            opacity: 0,
            tintOpacity: null,
            luminosityOpacity: null,
            state: null,
            tintColor: null,
          };
        case "list_notes":
          return list();
        case "load_note":
          if (!notes.has(args.filePath)) throw Error("NOT_FOUND");
          return notes.get(args.filePath);
        case "create_note":
          return create(args.fileName, args.content);
        case "save_note":
          notes.set(args.filePath, args.content);
          return;
        case "rename_note":
          if (notes.has(args.newName)) throw Error("目标名称已存在");
          notes.set(args.newName, notes.get(args.oldName) || "");
          notes.delete(args.oldName);
          tags[args.newName] = tags[args.oldName] || [];
          delete tags[args.oldName];
          return;
        case "delete_note":
          notes.delete(args.fileName);
          delete tags[args.fileName];
          return;
        case "get_all_tags":
          return tags;
        case "set_tags":
          tags[args.fileName] = args.tags;
          return;
        case "get_settings":
          return settings;
        case "save_app_settings":
          settings = {
            ...settings,
            auto_save: args.autoSave,
            shortcut: args.shortcut,
            autostart: args.autostart,
          };
          return;
        case "get_flashthoughts_dir_path":
          return "浏览器预览 · 不连接本地文档";
        case "inspect_buffer":
          return buffer;
        case "save_buffer":
          buffer = args.content;
          return;
        case "clear_buffer":
          buffer = "";
          return;
        case "archive_buffer": {
          if (!buffer.trim()) throw Error("EMPTY_BUFFER");
          const name = create(args.title, buffer);
          buffer = "";
          return name;
        }
        case "replace_buffer": {
          const name = buffer.trim() ? create(args.oldTitle, buffer) : null;
          buffer = args.content;
          return name;
        }
        case "plugin:window|get_all_windows":
          return ["main", "float"];
        case "plugin:webview|get_all_webviews":
          return [
            { label: "main", windowLabel: "main" },
            { label: "float", windowLabel: "float" },
          ];
        case "plugin:window|is_focused":
        case "plugin:window|is_visible":
          return true;
        case "plugin:dialog|open":
          return null;
        case "resolve_image":
          throw Error("浏览器预览不读取本地图片");
        case "search_notes":
          return list().filter(
            (n) =>
              n.file_name.includes(args.query) ||
              (notes.get(n.file_name) || "").includes(args.query),
          );
        default:
          return null;
      }
    },
    { shouldMockEvents: true },
  );
}
