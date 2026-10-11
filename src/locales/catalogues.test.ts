import { expect, it } from "vitest";
import en from "./en.json";
import zh from "./zh-CN.json";
it("ships complete paired offline messages with matching interpolation parameters", () => {
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  for (const [key, english] of Object.entries(en)) {
    const chinese = (zh as Record<string, string>)[key];
    expect(english.trim(), key).not.toBe("");
    expect(chinese.trim(), key).not.toBe("");
    expect(
      [...english.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort(),
      key,
    ).toEqual(
      [...chinese.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort(),
    );
  }
});
