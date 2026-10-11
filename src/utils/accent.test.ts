import { it, expect } from "vitest";
import { onAccent, migrateAccent, applyAccent } from "./accent";
it("明亮强调色选择深色文字，深色强调色选择白色文字", () => {
  expect(onAccent("#f59e0b")).toBe("#000000");
  expect(onAccent("#1f2937")).toBe("#ffffff");
});
it("retired pine profiles and incoming accent updates use the remaining green", () => {
  expect(migrateAccent("#39745A", "#2f634c")).toEqual({
    accent: "#10b981",
    hover: "#34d399",
  });
  applyAccent("#39745a", "#2f634c");
  expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
    "#10b981",
  );
  expect(migrateAccent("#527ac7", "#4268b2")).toEqual({
    accent: "#527ac7",
    hover: "#4268b2",
  });
});
