import { it, expect } from "vitest";
import { onAccent } from "./accent";
it("明亮强调色选择深色文字，深色强调色选择白色文字", () => {
  expect(onAccent("#f59e0b")).toBe("#000000");
  expect(onAccent("#39745a")).toBe("#ffffff");
});
