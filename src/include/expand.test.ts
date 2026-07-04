import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseIncludeAttrs,
  expandFileIncludes,
  expandIncludes,
  type ExpandContext,
  type ExpandGuard,
} from "./expand.js";

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
  beforeEach(() => {
    mockedFetchFileSource.mockReset();
  });

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

describe("expandFileIncludes — remote URLs", () => {
  beforeEach(() => {
    mockedFetchFileSource.mockReset();
    vi.unstubAllGlobals();
  });

  it("expands a remote include from an allowlisted host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "Remote body." })),
    );
    const out = await expandFileIncludes(
      "::include{file=https://example.org/x.md}",
      baseCtx({ allowedHosts: ["example.org"] }),
      baseGuard(),
    );
    expect(out).toContain("Remote body.");
  });

  it("rejects a remote include from a non-allowlisted host (strict throws)", async () => {
    await expect(
      expandFileIncludes(
        "::include{file=https://evil.test/x.md}",
        baseCtx({ allowedHosts: ["example.org"], strict: true }),
        baseGuard(),
      ),
    ).rejects.toThrow(/host not allowed/);
  });

  it("emits a warning marker for a non-allowlisted host when non-strict", async () => {
    const out = await expandFileIncludes(
      "::include{file=https://evil.test/x.md}",
      baseCtx({ allowedHosts: ["example.org"], strict: false }),
      baseGuard(),
    );
    expect(out).toContain("⚠️");
    expect(out).toContain("host not allowed");
  });

  it("errors on a non-OK remote response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })),
    );
    await expect(
      expandFileIncludes(
        "::include{file=https://example.org/missing.md}",
        baseCtx({ allowedHosts: ["example.org"], strict: true }),
        baseGuard(),
      ),
    ).rejects.toThrow(/404/);
  });
});

describe("expandFileIncludes — recursion + guards", () => {
  beforeEach(() => {
    mockedFetchFileSource.mockReset();
  });

  it("recursively expands includes inside an included markdown file", async () => {
    mockedFetchFileSource.mockImplementation(async (_ctx, args: any) => {
      if (args.path === "a.md") return { raw: "A\n\n::include{file=b.md}", ref: "main" };
      if (args.path === "b.md") return { raw: "B body", ref: "main" };
      throw new Error(`unexpected ${args.path}`);
    });
    const out = await expandFileIncludes("::include{file=a.md}", baseCtx(), baseGuard());
    expect(out).toContain("A");
    expect(out).toContain("B body");
    expect(out).not.toContain("::include");
  });

  it("detects a direct cycle", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "loop\n\n::include{file=a.md}", ref: "main" });
    await expect(
      expandFileIncludes("::include{file=a.md}", baseCtx({ strict: true }), baseGuard()),
    ).rejects.toThrow(/cycle detected/);
  });

  it("enforces the max depth", async () => {
    // Every file includes a deeper one, never terminating.
    mockedFetchFileSource.mockImplementation(async (_ctx, args: any) => ({
      raw: `level\n\n::include{file=${args.path}x.md}`,
      ref: "main",
    }));
    await expect(
      expandFileIncludes("::include{file=a.md}", baseCtx({ strict: true }), baseGuard()),
    ).rejects.toThrow(/max depth/);
  });

  it("allows the same file included twice in separate branches (diamond)", async () => {
    mockedFetchFileSource.mockImplementation(async (_ctx, args: any) => {
      if (args.path === "top.md")
        return { raw: "::include{file=shared.md}\n\n::include{file=shared.md}", ref: "main" };
      if (args.path === "shared.md") return { raw: "SHARED", ref: "main" };
      throw new Error(`unexpected ${args.path}`);
    });
    const out = await expandFileIncludes("::include{file=top.md}", baseCtx(), baseGuard());
    expect(out.match(/SHARED/g)?.length).toBe(2);
  });
});

describe("expandFileIncludes — robustness fixes", () => {
  beforeEach(() => {
    mockedFetchFileSource.mockReset();
    vi.unstubAllGlobals();
  });

  it("does not strip a leading --- block from a non-markdown include", async () => {
    mockedFetchFileSource.mockResolvedValue({
      raw: "---\nname: prod\nport: 8080\n---\nrest: true",
      ref: "main",
    });
    const out = await expandFileIncludes("::include{file=config/settings.yml}", baseCtx(), baseGuard());
    expect(out).toContain("name: prod");
    expect(out).toContain("port: 8080");
  });

  it("does not recurse into a non-markdown include's ::include-looking content", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "::include{file=evil.md}", ref: "main" });
    const out = await expandFileIncludes("::include{file=data.txt}", baseCtx(), baseGuard());
    // .txt is not markdown → fenced verbatim, its inner directive never followed
    expect(out).toContain("::include{file=evil.md}");
    // fetched exactly once (the .txt), never followed the inner directive
    expect(mockedFetchFileSource).toHaveBeenCalledTimes(1);
  });

  it("wraps a non-markdown include in a fenced code block using its language", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "name: prod\nport: 8080", ref: "main" });
    const out = await expandFileIncludes("::include{file=config/profiles.yaml}", baseCtx(), baseGuard());
    expect(out).toContain("```yaml");
    expect(out).toMatch(/```yaml\n[\s\S]*name: prod[\s\S]*```/);
    expect(out).not.toContain("::include");
  });

  it("blocks a remote include that responds with a redirect (allowlist bypass prevention)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 302, text: async () => "" })),
    );
    await expect(
      expandFileIncludes(
        "::include{file=https://example.org/redirect}",
        baseCtx({ allowedHosts: ["example.org"], strict: true }),
        baseGuard(),
      ),
    ).rejects.toThrow(/redirect blocked/);
  });

  it("passes redirect:manual to fetch so redirects are not auto-followed", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => "ok body" }));
    vi.stubGlobal("fetch", fetchMock);
    await expandFileIncludes(
      "::include{file=https://example.org/x.md}",
      baseCtx({ allowedHosts: ["example.org"] }),
      baseGuard(),
    );
    expect(fetchMock).toHaveBeenCalledWith(expect.anything(), { redirect: "manual" });
  });
});

describe("expandFileIncludes — debug logging", () => {
  beforeEach(() => {
    mockedFetchFileSource.mockReset();
  });

  it("traces each resolved directive through the provided logger", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "Body", ref: "main" });
    const debug = vi.fn();
    const out = await expandFileIncludes(
      "::include{file=chapter1.md}",
      baseCtx({ log: { debug } }),
      baseGuard(),
    );
    expect(out).toContain("Body");
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0][0]).toContain("::include chapter1.md");
  });

  it("does nothing when no logger is provided", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "Body", ref: "main" });
    await expect(
      expandFileIncludes("::include{file=a.md}", baseCtx(), baseGuard()),
    ).resolves.toContain("Body");
  });
});

describe("expandIncludes (source processor)", () => {
  beforeEach(() => {
    mockedFetchFileSource.mockReset();
  });

  it("returns an OutProcessor-shaped fn that expands includes with its bound ctx", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "Chapter body.", ref: "main" });
    const proc = expandIncludes({
      ctx: {} as any,
      project: "group/proj",
      ref: "main",
      allowedHosts: [],
      strict: true,
    });
    const out = await proc("::include{file=chapter1.md}");
    expect(out).toContain("Chapter body.");
    expect(mockedFetchFileSource).toHaveBeenCalledWith({} as any, {
      project: "group/proj",
      path: "chapter1.md",
      ref: "main",
    });
  });

  it("seeds cycle detection with the host path so a self-referential include is caught", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "loop", ref: "main" });
    const proc = expandIncludes({
      ctx: {} as any,
      project: "group/proj",
      ref: "main",
      path: "docs/page.md",
      allowedHosts: [],
      strict: true,
    });
    await expect(proc("::include{file=docs/page.md}")).rejects.toThrow(/cycle detected/);
  });
});
