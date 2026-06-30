import { describe, it, expect } from "vitest";
import { getOutProcessors } from "../include/out-processors.js";
import gitlabPlugin from "./index.js";

const ctx = { siteDir: "/site" } as any;
const opts = { host: "https://gitlab.example.com", cache: false } as any;

const ruleOptions = (o: any) => {
  const wp = gitlabPlugin(ctx, o).configureWebpack!({} as any, false, {} as any);
  return (wp.module!.rules as any[])[0].use[0].options;
};

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

  it("scopes the rule's include to siteDir instead of leaving it undefined", () => {
    // @docusaurus/core's synthetic MDX-fallback plugin flattens every
    // `.mdx?`-matching rule's `include` into its own `exclude` array
    // (getMDXFallbackExcludedPaths in server/plugins/synthetic.js). Without
    // an explicit `include`, that flatMap injects a literal `undefined`
    // into the array — and the webpack-merge pass that wires the fallback
    // plugin's result back into the config turns that `undefined` hole into
    // `null`, which fails webpack's config schema and aborts the build.
    // Reproduced directly against webpack-merge while debugging Task 12's
    // e2e test; see examples/site's real Docusaurus build for the full repro.
    const wp = gitlabPlugin(ctx, opts).configureWebpack!({} as any, false, {} as any);
    const rule = (wp.module!.rules as any[])[0];
    expect(rule.include).toEqual(["/site"]);
  });

  it("falls back to cwd for include when context has no siteDir", () => {
    const wp = gitlabPlugin({} as any, opts).configureWebpack!({} as any, false, {} as any);
    const rule = (wp.module!.rules as any[])[0];
    expect(rule.include).toEqual([process.cwd()]);
  });

  it("appends (not index-merges) module.rules so other plugins' rules survive webpack-merge", () => {
    // webpack-merge's default array strategy deep-merges `module.rules` by
    // index instead of concatenating, which would corrupt other plugins'
    // rule objects. `append` makes it plain-concat instead.
    const wp = gitlabPlugin(ctx, opts).configureWebpack!({} as any, false, {} as any);
    expect((wp as any).mergeStrategy).toEqual({ "module.rules": "append" });
  });

  it("contributes the theme stylesheet", () => {
    const mods = gitlabPlugin(ctx, opts).getClientModules!();
    expect(mods[0]).toContain("theme.css");
  });

  it("validates options eagerly", () => {
    expect(() => gitlabPlugin(ctx, { host: "not-a-url" } as any)).toThrow();
  });

  it("drives the built-in fixes via resolved options (default on)", () => {
    expect(ruleOptions(opts).resolved.fixAutolinks).toBe(true);
    expect(ruleOptions(opts).resolved.fixVoidTags).toBe(true);
    expect(ruleOptions({ ...opts, fixAutolinks: false }).resolved.fixAutolinks).toBe(false);
    expect(ruleOptions({ ...opts, fixVoidTags: false }).resolved.fixVoidTags).toBe(false);
  });

  it("drives stripToc via resolved options (default off)", () => {
    expect(ruleOptions(opts).resolved.stripToc).toBe(false);
    expect(ruleOptions({ ...opts, stripToc: true }).resolved.stripToc).toBe(true);
  });

  it("registers user outProcessors under the loader's processorsId", () => {
    const user = (md: string) => md;
    const o = { host: "https://gl.custom.example.com", cache: false, outProcessors: [user] } as any;
    const { processorsId } = ruleOptions(o);
    expect(typeof processorsId).toBe("string");
    expect(getOutProcessors(processorsId)).toEqual([user]);
  });
});
