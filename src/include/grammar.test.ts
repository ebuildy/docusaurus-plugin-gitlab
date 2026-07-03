import { describe, it, expect } from "vitest";
import { parseInclude } from "./grammar.js";

describe("parseInclude readme", () => {
  it("parses a bare project", () => {
    expect(parseInclude("readme", "g/p")).toEqual({ kind: "readme", project: "g/p" });
  });
  it("parses a nested group project", () => {
    expect(parseInclude("readme", "g/sub/p")).toEqual({ kind: "readme", project: "g/sub/p" });
  });
  it("parses a ref prefix (ref may contain a slash)", () => {
    expect(parseInclude("readme", "feat/x@g/p")).toEqual({ kind: "readme", project: "g/p", ref: "feat/x" });
  });
  it("rejects a file path", () => {
    expect(() => parseInclude("readme", "g/p/-/README.md")).toThrow();
  });
  it("rejects empty input", () => {
    expect(() => parseInclude("readme", "")).toThrow();
  });
});

describe("parseInclude file", () => {
  it("splits project and path on /-/", () => {
    expect(parseInclude("file", "g/sub/p/-/src/a.ts")).toEqual({
      kind: "file", project: "g/sub/p", path: "src/a.ts",
    });
  });
  it("parses ref + path + line range", () => {
    expect(parseInclude("file", "v1.2@g/p/-/src/a.ts#L10-25")).toEqual({
      kind: "file", project: "g/p", path: "src/a.ts", ref: "v1.2", lineRange: "10-25",
    });
  });
  it("parses a single-line range", () => {
    expect(parseInclude("file", "g/p/-/a.ts#L7")).toEqual({
      kind: "file", project: "g/p", path: "a.ts", lineRange: "7",
    });
  });
  it("requires a /-/ path", () => {
    expect(() => parseInclude("file", "g/p")).toThrow();
  });
});
