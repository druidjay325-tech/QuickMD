import { expect, it } from "vitest";
import { countWords } from "./wordCount";
it("counts Han characters and multilingual words without standalone punctuation", () => {
  expect(countWords("Hello world!")).toBe(2);
  expect(countWords("你好 world")).toBe(3);
  expect(countWords("hello你好world")).toBe(4);
  expect(countWords("𠀀㐀a")).toBe(3);
  expect(countWords("**Café** — déjà vu")).toBe(3);
  expect(countWords("... --- **")).toBe(0);
  expect(countWords("don't re-write")).toBe(2);
});
