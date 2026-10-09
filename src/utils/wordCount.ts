/** Pure utility: count words in markdown text (Chinese chars + English words) */
export function countWords(markdown: string): number {
  const chineseChars = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = markdown
    .replace(/[\u4e00-\u9fff]/g, "")
    .split(/\s+/)
    .filter(Boolean).length;
  return chineseChars + englishWords;
}

export function getDailyFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}.md`;
}

/** Fallback filename for main-window typing when no file is selected.
 *  Uses seconds to avoid overwriting existing archive files. */
export function getTimestampFileName(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `闪念-${y}-${m}-${d}-${hh}-${mm}-${ss}.md`;
}

/** Generate a unique file name by appending "(2)", "(3)", etc. */
export function makeUniqueName(
  baseName: string,
  existing: { file_name: string }[],
): string {
  const ext = ".md";
  const stem = baseName.endsWith(ext)
    ? baseName.slice(0, -ext.length)
    : baseName;
  const names = new Set(existing.map((n) => n.file_name));
  if (!names.has(`${stem}${ext}`)) return `${stem}${ext}`;
  for (let i = 2; i < 100; i++) {
    const cand = `${stem}(${i})${ext}`;
    if (!names.has(cand)) return cand;
  }
  return `${stem}-${Date.now()}${ext}`;
}
