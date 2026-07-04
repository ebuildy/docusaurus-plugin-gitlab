import { describe, it, expect } from "vitest";
import { parseIncludeAttrs } from "./expand.js";

describe("parseIncludeAttrs", () => {
  it("reads a bare file value", () => {
    expect(parseIncludeAttrs("file=chapter1.md")).toEqual({ file: "chapter1.md" });
  });
  it("reads a double-quoted file value with spaces", () => {
    expect(parseIncludeAttrs('file="a b.md"')).toEqual({ file: "a b.md" });
  });
  it("reads a single-quoted file value", () => {
    expect(parseIncludeAttrs("file='c.md'")).toEqual({ file: "c.md" });
  });
  it("reads a URL value", () => {
    expect(parseIncludeAttrs("file=https://example.org/x.md")).toEqual({
      file: "https://example.org/x.md",
    });
  });
  it("returns empty when file is absent", () => {
    expect(parseIncludeAttrs("other=1")).toEqual({});
  });
});
