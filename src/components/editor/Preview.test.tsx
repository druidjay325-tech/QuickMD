import { it, expect, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import Preview from "./Preview";
import { renderMarkdown, sanitizeDiagram } from "../../utils/markdown";
afterEach(cleanup);
it("清空正文同时清空旧预览", async () => {
  const { container, rerender } = render(<Preview content="# Original" />);
  await waitFor(() =>
    expect(container.querySelector("h1")?.textContent).toBe("Original"),
  );
  rerender(<Preview content="" />);
  await waitFor(() => expect(container.querySelector("h1")).toBeNull());
});
it("原始 HTML 与远程图片不能形成活动内容", () => {
  const el = document.createElement("div");
  el.innerHTML = renderMarkdown(
    '<img src=x onerror="alert(1)">\n\n![remote](https://example.test/private.png)',
  );
  expect(el.querySelector("img")).toBeNull();
  expect(el.querySelector("[onerror]")).toBeNull();
  expect(el.textContent).toContain("外部图片已阻止");
});
it("Mermaid SVG 清除活动外部资源", () => {
  const el = document.createElement("div");
  el.innerHTML = sanitizeDiagram(
    '<svg><image href="https://example.test/x"/><foreignObject><iframe src="https://example.test"></iframe></foreignObject><text onload="alert(1)">safe</text></svg>',
  );
  expect(el.querySelector("image,iframe,foreignObject,[onload]")).toBeNull();
  expect(el.textContent).toBe("safe");
});
