import remarkParse from "remark-parse";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveOptions } from "../options.js";
import { buildContext, CACHE_DIR, warnIfChainMissingSanitize } from "./context.js";
import { defaultMarkdownRenderChain } from "./markdown.js";

// vi.hoisted is required: a vi.mock factory may not reference an out-of-scope
// variable unless it was created with vi.hoisted.
const warn = vi.hoisted(() => vi.fn());
vi.mock("@docusaurus/logger", () => ({ default: { warn } }));

beforeEach(() => warn.mockClear());

describe("buildContext", () => {
  it("builds a context with client, cache, assets and host", () => {
    const resolved = resolveOptions({ host: "https://gitlab.example.com" }, "development");
    const ctx = buildContext(resolved);
    expect(ctx.client).toBeDefined();
    expect(ctx.cache).toBeDefined();
    expect(ctx.assets).toBeDefined();
    expect(ctx.options.host).toBe("https://gitlab.example.com");
  });

  it("exposes the cache dir under node_modules/.cache", () => {
    expect(CACHE_DIR).toContain("node_modules/.cache/@ebuildy/docusaurus-plugin-gitlab");
  });
});

describe("warnIfChainMissingSanitize", () => {
  it("warns when the chain has no rehype-sanitize", async () => {
    await warnIfChainMissingSanitize([remarkParse]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("rehype-sanitize");
  });

  it("does not warn when the chain contains rehype-sanitize", async () => {
    await warnIfChainMissingSanitize(defaultMarkdownRenderChain);
    expect(warn).not.toHaveBeenCalled();
  });
});
