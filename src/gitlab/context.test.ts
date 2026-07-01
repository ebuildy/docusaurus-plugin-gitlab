import { describe, it, expect } from "vitest";
import { resolveOptions } from "../options.js";
import { buildContext, CACHE_DIR } from "./context.js";

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
