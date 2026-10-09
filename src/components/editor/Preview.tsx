import { useRef, useState, useEffect, useCallback } from "react";
import { renderMarkdown, sanitizeDiagram } from "../../utils/markdown";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveImage, openExternalLink } from "../../commands";
import { openConfirmDialog } from "../ConfirmDialog";
import { EditorContextMenu } from "./EditorContextMenu";
import "./Preview.css";
import { useTheme } from "../../hooks/useTheme";

/** Extract text from rendered DOM, preserving list markers */
function extractRenderedText(node: Node, listDepth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  let text = "";

  if (tag === "ul" || tag === "ol") {
    const items = Array.from(el.children).filter(
      (c) => c.tagName.toLowerCase() === "li",
    );
    items.forEach((li, i) => {
      const marker = tag === "ol" ? `${i + 1}. ` : "\u2022 ";
      text +=
        "  ".repeat(listDepth) +
        marker +
        extractRenderedText(li, listDepth + 1).trim() +
        "\n";
    });
    return text;
  }

  if (tag === "br") return "\n";

  for (const child of el.childNodes) {
    text += extractRenderedText(child, listDepth);
  }

  if (
    [
      "p",
      "div",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "pre",
      "tr",
      "hr",
    ].includes(tag)
  ) {
    text += "\n";
  }

  return text;
}

interface PreviewProps {
  content: string;
  scrollRatio?: number;
  onScrollChange?: (ratio: number) => void;
  highlightTerm?: string;
  highlightCaseSensitive?: boolean;
  highlightCurrentIdx?: number;
}

export default function Preview({
  content,
  scrollRatio,
  onScrollChange,
  highlightTerm,
  highlightCaseSensitive,
  highlightCurrentIdx,
}: PreviewProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderedHtml, setRenderedHtml] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const renderIdRef = useRef(0);

  // ── Context menu ──────────────────────────────────────────
  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setCtxMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleCopy = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const sel = window.getSelection();

    let html: string;
    let plain: string;

    if (sel && sel.toString().trim()) {
      const range = sel.getRangeAt(0);
      const frag = range.cloneContents();
      const tempDiv = document.createElement("div");
      tempDiv.appendChild(frag);
      html = tempDiv.innerHTML;
      plain = extractRenderedText(tempDiv).trim();
    } else {
      html = el.innerHTML;
      plain = extractRenderedText(el).trim();
    }

    // Write both text/html and text/plain via a temporary copy event
    const handler = (e: ClipboardEvent) => {
      e.preventDefault();
      e.clipboardData?.setData("text/html", html);
      e.clipboardData?.setData("text/plain", plain);
    };
    document.addEventListener("copy", handler);
    document.execCommand("copy");
    document.removeEventListener("copy", handler);
  }, []);

  const handleSelectAll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []);

  // Sync scroll from code editor
  useEffect(() => {
    const el = containerRef.current;
    if (!el || scrollRatio === undefined) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) {
      el.scrollTop = Math.round(scrollRatio * max);
    }
  }, [scrollRatio]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || !onScrollChange) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) onScrollChange(el.scrollTop / max);
  }, [onScrollChange]);

  useEffect(() => {
    ++renderIdRef.current;
    setRenderedHtml(renderMarkdown(content));
  }, [content]);

  // Apply HTML to DOM and handle code-block post-processing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = renderedHtml;
    const generation = renderIdRef.current;
    el.querySelectorAll<HTMLElement>("[data-local-image]").forEach(
      async (placeholder) => {
        try {
          const path = await resolveImage(placeholder.dataset.localImage || "");
          if (generation !== renderIdRef.current || !placeholder.isConnected)
            return;
          const image = document.createElement("img");
          image.alt = placeholder.textContent?.split(" · ")[0] || "图片";
          image.loading = "lazy";
          image.src = convertFileSrc(path);
          placeholder.replaceWith(image);
        } catch {
          if (placeholder.isConnected)
            placeholder.textContent = "图片无法加载 · 请检查路径";
        }
      },
    );

    // Add language labels to code blocks (attached to wrapper, not pre)
    const codeBlocks = el.querySelectorAll("pre code[class*='language-']");
    codeBlocks.forEach((block) => {
      const cls = block.className;
      const match = cls.match(/language-(\w+)/);
      if (match && block.parentElement) {
        const pre = block.parentElement;
        const wrapper = document.createElement("div");
        wrapper.className = "code-block-wrapper";
        pre.parentNode?.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        const label = document.createElement("span");
        label.className = "code-lang";
        label.textContent = match[1];
        wrapper.appendChild(label);
      }
    });

    // Render Mermaid diagrams
    const mermaidBlocks = el.querySelectorAll("pre code.language-mermaid");
    if (mermaidBlocks.length > 0) {
      import("mermaid").then((mermaid) => {
        mermaid.default.initialize({
          startOnLoad: false,
          theme: theme === "light" ? "default" : "dark",
          securityLevel: "strict",
          htmlLabels: false,
        });
        mermaidBlocks.forEach(async (block, i) => {
          try {
            const { svg } = await mermaid.default.render(
              `mermaid-${crypto.randomUUID()}-${i}`,
              block.textContent || "",
            );
            const container = block.parentElement;
            if (container) {
              const div = document.createElement("div");
              div.className = "mermaid-render";
              if (generation !== renderIdRef.current || !block.isConnected)
                return;
              div.innerHTML = sanitizeDiagram(svg);
              container.replaceWith(div);
            }
          } catch {}
        });
      });
    }

    // Highlight find matches in text nodes
    if (highlightTerm) {
      const escaped = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Non-global regex for checking (no lastIndex issues)
      const checkRegex = new RegExp(escaped, highlightCaseSensitive ? "" : "i");
      // Global regex for wrapping
      const wrapRegex = new RegExp(
        escaped,
        highlightCaseSensitive ? "g" : "gi",
      );

      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node.textContent || !checkRegex.test(node.textContent)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const nodesToWrap: Text[] = [];
      let current;
      while ((current = walker.nextNode())) nodesToWrap.push(current as Text);

      let matchCounter = 0;
      for (const textNode of nodesToWrap) {
        wrapRegex.lastIndex = 0;
        const text = textNode.textContent || "";
        const frag = document.createDocumentFragment();
        let lastEnd = 0;
        let m;
        while ((m = wrapRegex.exec(text)) !== null) {
          if (m.index > lastEnd)
            frag.appendChild(
              document.createTextNode(text.substring(lastEnd, m.index)),
            );
          const mark = document.createElement("mark");
          mark.className = "preview-find-highlight";
          if (
            highlightCurrentIdx !== undefined &&
            matchCounter === highlightCurrentIdx
          ) {
            mark.classList.add("preview-find-highlight-current");
          }
          mark.textContent = m[0];
          frag.appendChild(mark);
          matchCounter++;
          lastEnd = m.index + m[0].length;
          if (m.index === wrapRegex.lastIndex) wrapRegex.lastIndex++;
        }
        if (lastEnd < text.length)
          frag.appendChild(document.createTextNode(text.substring(lastEnd)));
        textNode.parentNode?.replaceChild(frag, textNode);
      }

      // Scroll to current match
      if (highlightCurrentIdx !== undefined && highlightCurrentIdx >= 0) {
        const currentMark = el.querySelector(
          "mark.preview-find-highlight-current",
        );
        if (currentMark) {
          currentMark.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }
  }, [
    renderedHtml,
    highlightTerm,
    highlightCaseSensitive,
    highlightCurrentIdx,
    theme,
  ]);

  return (
    <div className="preview-wrapper">
      <div
        className="preview-pane"
        ref={containerRef}
        onScroll={handleScroll}
        onContextMenu={handleContextMenu}
        onClick={async (e) => {
          const link = (e.target as HTMLElement).closest("a");
          if (!link) return;
          const href = link.getAttribute("href") || "";
          if (href.startsWith("#")) return;
          e.preventDefault();
          if (!/^https?:\/\//i.test(href)) return;
          const result = await openConfirmDialog({
            title: "打开外部链接？",
            message: href,
            buttons: [
              { text: "打开", value: "open", primary: true },
              { text: "取消", value: "cancel" },
            ],
          });
          if (result === "open") await openExternalLink(href).catch(() => {});
        }}
      ></div>
      {/* 菜单独立挂载，不参与预览正文的 DOM 替换 */}
      {ctxMenu && (
        <EditorContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onCopy={handleCopy}
          onSelectAll={handleSelectAll}
        />
      )}
    </div>
  );
}
