import { describe, it, expect } from "vitest";
import { applyLineRange, languageFromPath } from "./code.js";

describe("applyLineRange", () => {
  it("returns whole text when no range", () => {
    expect(applyLineRange("a\nb\nc")).toBe("a\nb\nc");
  });
  it("slices an inclusive 1-based range", () => {
    expect(applyLineRange("a\nb\nc\nd", "2-3")).toBe("b\nc");
  });
  it("slices a single line", () => {
    expect(applyLineRange("a\nb\nc", "2")).toBe("b");
  });
  it("ignores a malformed range", () => {
    expect(applyLineRange("a\nb", "xyz")).toBe("a\nb");
  });
});

describe("languageFromPath", () => {
  it("maps known extensions", () => {
    expect(languageFromPath("src/foo.ts")).toBe("ts");
    expect(languageFromPath("a/b/main.py")).toBe("python");
    expect(languageFromPath("x.yml")).toBe("yaml");
  });
  it("falls back to the raw extension", () => {
    expect(languageFromPath("file.unknownext")).toBe("unknownext");
  });
});
