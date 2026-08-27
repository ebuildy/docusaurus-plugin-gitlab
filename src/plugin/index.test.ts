import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { getOutProcessors } from "../include/out-processors.js";
import gitlabPlugin from "./index.js";

vi.mock("../generate/index.js", () => ({
  generateAll: vi.fn(async () => ({ directives: 0, pagesWritten: 0 })),
}));
import { generateAll } from "../generate/index.js";

const ctx = { siteDir: "/site" } as any;
const assetDir = mkdtempSync(join(tmpdir(), "glplugin-assets-"));
const opts = { host: "https://gitlab.example.com", cache: false, assetDir } as any;

const ruleOptions = async (o: any) => {
  const plugin = await gitlabPlugin(ctx, o);
  const wp = plugin.configureWebpack!({} as any, false, {} as any);
  return (wp.module!.rules as any[])[0].use[0].options;
};

describe("gitlabPlugin", () => {
  it("has the package name", async () => {
    const plugin = await gitlabPlugin(ctx, opts);
    expect(plugin.name).toBe("@ebuildy/docusaurus-plugin-gitlab");
  });

  it("registers a pre-loader rule for markdown files", async () => {
    const plugin = await gitlabPlugin(ctx, opts);
    const wp = plugin.configureWebpack!({} as any, false, {} as any);
    const rule = (wp.module!.rules as any[])[0];
    expect(rule.enforce).toBe("pre");
    expect(String(rule.test)).toContain("mdx?");
    expect(rule.use[0].loader).toContain("include");
    expect(rule.use[0].loader).toContain("loader.js");
    expect(rule.use[0].options.resolved.host).toBe("https://gitlab.example.com");
  });

  it("scopes the rule's include to siteDir instead of leaving it undefined", async () => {
    // @docusaurus/core's synthetic MDX-fallback plugin flattens every
    // `.mdx?`-matching rule's `include` into its own `exclude` array
    // (getMDXFallbackExcludedPaths in server/plugins/synthetic.js). Without
    // an explicit `include`, that flatMap injects a literal `undefined`
    // into the array — and the webpack-merge pass that wires the fallback
    // plugin's result back into the config turns that `undefined` hole into
    // `null`, which fails webpack's config schema and aborts the build.
    // Reproduced directly against webpack-merge while debugging Task 12's
    // e2e test; see examples/site's real Docusaurus build for the full repro.
    const plugin = await gitlabPlugin(ctx, opts);
    const wp = plugin.configureWebpack!({} as any, false, {} as any);
    const rule = (wp.module!.rules as any[])[0];
    expect(rule.include).toEqual(["/site"]);
  });

  it("falls back to cwd for include when context has no siteDir", async () => {
    const plugin = await gitlabPlugin({} as any, opts);
    const wp = plugin.configureWebpack!({} as any, false, {} as any);
    const rule = (wp.module!.rules as any[])[0];
    expect(rule.include).toEqual([process.cwd()]);
  });

  it("appends (not index-merges) module.rules so other plugins' rules survive webpack-merge", async () => {
    // webpack-merge's default array strategy deep-merges `module.rules` by
    // index instead of concatenating, which would corrupt other plugins'
    // rule objects. `append` makes it plain-concat instead.
    const plugin = await gitlabPlugin(ctx, opts);
    const wp = plugin.configureWebpack!({} as any, false, {} as any);
    expect((wp as any).mergeStrategy).toEqual({ "module.rules": "append" });
  });

  it("registers exactly one loader rule", async () => {
    // Guards against the loader being registered twice, which would run
    // include-substitution twice over every .md(x) file in the site.
    const plugin = await gitlabPlugin(ctx, opts);
    const wp = plugin.configureWebpack!({} as any, false, {} as any);
    expect((wp.module!.rules as any[]).length).toBe(1);
  });

  it("exposes configureWebpack and NOT configureBundler", async () => {
    // TRIPWIRE — read before "fixing" this test.
    //
    // Docusaurus v4 deprecates configureWebpack(...args) in favour of
    // configureBundler({...}), but v4 is unpublished and the signature is
    // unknown. We deliberately ship only configureWebpack, which v4 still
    // supports (deprecated != removed).
    //
    // If you add configureBundler, this test fails on purpose. Before deleting
    // it, prove Docusaurus does not call BOTH hooks — if it does, the loader
    // registers twice and every markdown file is processed twice.
    const plugin = await gitlabPlugin(ctx, opts);
    expect(typeof plugin.configureWebpack).toBe("function");
    expect((plugin as Record<string, unknown>).configureBundler).toBeUndefined();
  });

  it("contributes the theme stylesheet", async () => {
    const plugin = await gitlabPlugin(ctx, opts);
    const mods = plugin.getClientModules!();
    expect(mods[0]).toContain("theme.css");
  });

  it("validates options eagerly", async () => {
    await expect(gitlabPlugin(ctx, { host: "not-a-url" } as any)).rejects.toThrow();
  });

  it("drives the built-in fixes via resolved options (default on)", async () => {
    expect((await ruleOptions(opts)).resolved.fixAutolinks).toBe(true);
    expect((await ruleOptions(opts)).resolved.fixVoidTags).toBe(true);
    expect((await ruleOptions(opts)).resolved.fixInlineStyles).toBe(true);
    expect((await ruleOptions(opts)).resolved.convertAlerts).toBe(true);
    expect((await ruleOptions({ ...opts, fixAutolinks: false })).resolved.fixAutolinks).toBe(false);
    expect((await ruleOptions({ ...opts, fixVoidTags: false })).resolved.fixVoidTags).toBe(false);
    expect((await ruleOptions({ ...opts, fixInlineStyles: false })).resolved.fixInlineStyles).toBe(false);
    expect((await ruleOptions({ ...opts, convertAlerts: false })).resolved.convertAlerts).toBe(false);
  });

  it("drives stripToc via resolved options (default off)", async () => {
    expect((await ruleOptions(opts)).resolved.stripToc).toBe(false);
    expect((await ruleOptions({ ...opts, stripToc: true })).resolved.stripToc).toBe(true);
  });

  it("registers user outProcessors under the loader's processorsId", async () => {
    const user = (md: string) => md;
    const o = { host: "https://gl.custom.example.com", cache: false, assetDir, outProcessors: [user] } as any;
    const { processorsId } = await ruleOptions(o);
    expect(typeof processorsId).toBe("string");
    expect(getOutProcessors(processorsId)).toEqual([user]);
  });

  it("is an async plugin that returns the plugin object and registers a CLI command", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "glplugin-"));
    const plugin = await gitlabPlugin({ siteDir } as any, opts);
    expect(plugin.name).toBe("@ebuildy/docusaurus-plugin-gitlab");

    const registered: string[] = [];
    const cli = {
      command: (name: string) => {
        registered.push(name);
        const chain: any = { description: () => chain, action: () => chain };
        return chain;
      },
    };
    plugin.extendCli?.(cli as any);
    expect(registered).toContain("gitlab:generate");
  });

  it("runs generation against the site's docs dir during init", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "glgen-init-"));
    await gitlabPlugin({ siteDir } as any, opts);
    expect(generateAll).toHaveBeenCalledWith(expect.anything(), join(siteDir, "docs"), {
      strict: expect.any(Boolean),
    });
  });

  it("does not generate when the context provides no siteDir", async () => {
    (generateAll as unknown as { mockClear: () => void }).mockClear();
    await gitlabPlugin({} as any, opts);
    expect(generateAll).not.toHaveBeenCalled();
  });

  it("creates the asset dir before Docusaurus snapshots the static directories", async () => {
    // Docusaurus decides whether to copy `static/` when it BUILDS the webpack
    // config (StaticDirectoriesCopyPlugin skips a missing or empty dir), while
    // our assets are only written later, during compilation. On a first build of
    // a site with no other static files that meant the localized README images
    // never reached `build/`. Creating the dir + marker in the plugin factory —
    // which Docusaurus awaits during plugin loading — closes that window.
    const dir = mkdtempSync(join(tmpdir(), "glplugin-early-"));
    const target = join(dir, "static", "gitlab-assets");
    await gitlabPlugin(ctx, { ...opts, assetDir: target });
    expect(existsSync(join(target, ".gitkeep"))).toBe(true);
  });
});
