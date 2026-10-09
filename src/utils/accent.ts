export function onAccent(color: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return "#ffffff";
  const values = [1, 3, 5].map((start) => {
    const n = parseInt(color.slice(start, start + 2), 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  const l = values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  return 1.05 / (l + 0.05) >= 4.5 ? "#ffffff" : "#000000";
}
export function applyAccent(accent: string, hover: string) {
  if (!/^#[0-9a-f]{6}$/i.test(accent)) return;
  document.documentElement.style.setProperty("--accent", accent);
  document.documentElement.style.setProperty("--accent-hover", hover);
  document.documentElement.style.setProperty("--on-accent", onAccent(accent));
}
