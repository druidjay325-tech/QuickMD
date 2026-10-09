import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
const md: MarkdownIt = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  highlight: (text, lang): string => {
    if (text.length < 100000 && lang && hljs.getLanguage(lang))
      return hljs.highlight(text, { language: lang }).value;
    return md.utils.escapeHtml(text);
  },
})
  .use(footnote)
  .use(taskLists);
md.renderer.rules.image = (tokens, i) => {
  const token = tokens[i],
    source = token.attrGet("src") || "",
    alt = token.content || "图片";
  if (/^(?:https?:|\/\/|data:|javascript:)/i.test(source))
    return `<span class="blocked-resource" title="为保护隐私，远程图片不会自动加载">${md.utils.escapeHtml(alt)} · 外部图片已阻止</span>`;
  return `<span class="local-image" data-local-image="${md.utils.escapeHtml(source)}">${md.utils.escapeHtml(alt)} · 正在载入图片</span>`;
};
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(md.render(text), {
    FORBID_TAGS: ["iframe", "object", "embed", "form", "style", "script"],
    FORBID_ATTR: ["style"],
  });
}
export function sanitizeDiagram(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "image", "a"],
    FORBID_ATTR: ["href", "xlink:href"],
  });
}
