import { describe, it, expect } from "vitest";
import gitlabPlugin from "./index.js";

const ctx = {} as any;
const opts = { host: "https://gitlab.example.com", cache: false } as any;

describe("gitlabPlugin", () => {
  it("has the package name", () => {
    expect(gitlabPlugin(ctx, opts).name).toBe("@ebuildy/docusaurus-plugin-gitlab");
  });

  it("registers a pre-loader rule for markdown files", () => {
    const wp = gitlabPlugin(ctx, opts).configureWebpack!({} as any, false, {} as any);
    const rule = (wp.module!.rules as any[])[0];
    expect(rule.enforce).toBe("pre");
    expect(String(rule.test)).toContain("mdx?");
    expect(rule.use[0].loader).toContain("include");
    expect(rule.use[0].loader).toContain("loader.js");
    expect(rule.use[0].options.resolved.host).toBe("https://gitlab.example.com");
  });

  it("contributes the theme stylesheet", () => {
    const mods = gitlabPlugin(ctx, opts).getClientModules!();
    expect(mods[0]).toContain("theme.css");
  });

  it("validates options eagerly", () => {
    expect(() => gitlabPlugin(ctx, { host: "not-a-url" } as any)).toThrow();
  });
});
