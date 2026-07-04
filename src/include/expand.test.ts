import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseIncludeAttrs, expandFileIncludes, type ExpandContext, type ExpandGuard } from "./expand.js";

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

vi.mock("../gitlab/fetchers.js", () => ({
  fetchFileSource: vi.fn(),
}));
import { fetchFileSource } from "../gitlab/fetchers.js";

const mockedFetchFileSource = vi.mocked(fetchFileSource);

function baseCtx(overrides: Partial<ExpandContext> = {}): ExpandContext {
  return {
    ctx: {} as any,
    project: "group/proj",
    ref: "main",
    allowedHosts: [],
    strict: true,
    ...overrides,
  };
}

function baseGuard(): ExpandGuard {
  return { depth: 0, stack: new Set(["group/proj@main/-/README.md"]) };
}

describe("expandFileIncludes — relative GitLab files", () => {
  beforeEach(() => mockedFetchFileSource.mockReset());

  it("replaces a directive with the fetched file's raw content", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "Chapter one body.", ref: "main" });
    const out = await expandFileIncludes(
      "Intro\n\n::include{file=chapter1.md}\n\nOutro",
      baseCtx(),
      baseGuard(),
    );
    expect(out).toContain("Chapter one body.");
    expect(out).not.toContain("::include");
    expect(mockedFetchFileSource).toHaveBeenCalledWith({} as any, {
      project: "group/proj",
      path: "chapter1.md",
      ref: "main",
    });
  });

  it("strips frontmatter from the included file", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "---\ntitle: x\n---\nBody", ref: "main" });
    const out = await expandFileIncludes("::include{file=a.md}", baseCtx(), baseGuard());
    expect(out).toContain("Body");
    expect(out).not.toContain("title: x");
  });

  it("leaves a directive inside a fenced code block untouched", async () => {
    const md = "```\n::include{file=chapter1.md}\n```";
    const out = await expandFileIncludes(md, baseCtx(), baseGuard());
    expect(out).toBe(md);
    expect(mockedFetchFileSource).not.toHaveBeenCalled();
  });

  it("returns the source unchanged when there is no directive", async () => {
    const out = await expandFileIncludes("plain text", baseCtx(), baseGuard());
    expect(out).toBe("plain text");
    expect(mockedFetchFileSource).not.toHaveBeenCalled();
  });
});
