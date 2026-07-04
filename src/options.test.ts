import { describe, it, expect } from "vitest";
import { resolveOptions } from "./options";

describe("resolveOptions", () => {
  it("applies defaults for a minimal config", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "production");
    expect(o.host).toBe("https://gitlab.com");
    expect(o.strict).toBe(true);
    expect(o.assetDir).toBe("static/gitlab-assets");
    expect(o.assetBaseUrl).toBe("/gitlab-assets");
    expect(o.cache).toEqual({ ttl: 3600 });
  });

  it("defaults strict to false in development", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "development");
    expect(o.strict).toBe(false);
  });

  it("strips a trailing slash from host", () => {
    const o = resolveOptions({ host: "https://gl.example.com/" }, "production");
    expect(o.host).toBe("https://gl.example.com");
  });

  it("allows disabling cache", () => {
    const o = resolveOptions({ host: "https://gitlab.com", cache: false }, "production");
    expect(o.cache).toBe(false);
  });

  it("throws on a missing host", () => {
    expect(() => resolveOptions({} as any, "production")).toThrow(/host/);
  });

  it("throws on an unknown option", () => {
    expect(() =>
      resolveOptions({ host: "https://gitlab.com", nope: 1 } as any, "production"),
    ).toThrow();
  });

  it("tolerates the `id` field Docusaurus injects into every plugin's options", () => {
    // @docusaurus/core's doValidatePluginOptions always adds `id` to a
    // plugin's options before invoking it, even without a validateOptions
    // hook — see examples/site/docusaurus.config.ts's top-level `plugins`.
    expect(() =>
      resolveOptions({ host: "https://gitlab.com", id: "default" } as any, "production"),
    ).not.toThrow();
  });

  it("enables fixAutolinks by default and lets it be disabled", () => {
    expect(resolveOptions({ host: "https://gitlab.com" }, "production").fixAutolinks).toBe(true);
    expect(
      resolveOptions({ host: "https://gitlab.com", fixAutolinks: false }, "production").fixAutolinks,
    ).toBe(false);
  });

  it("enables fixVoidTags by default and lets it be disabled", () => {
    expect(resolveOptions({ host: "https://gitlab.com" }, "production").fixVoidTags).toBe(true);
    expect(
      resolveOptions({ host: "https://gitlab.com", fixVoidTags: false }, "production").fixVoidTags,
    ).toBe(false);
  });

  it("enables fixInlineStyles by default and lets it be disabled", () => {
    expect(resolveOptions({ host: "https://gitlab.com" }, "production").fixInlineStyles).toBe(true);
    expect(
      resolveOptions({ host: "https://gitlab.com", fixInlineStyles: false }, "production")
        .fixInlineStyles,
    ).toBe(false);
  });

  it("enables convertAlerts by default and lets it be disabled", () => {
    expect(resolveOptions({ host: "https://gitlab.com" }, "production").convertAlerts).toBe(true);
    expect(
      resolveOptions({ host: "https://gitlab.com", convertAlerts: false }, "production")
        .convertAlerts,
    ).toBe(false);
  });

  it("disables stripToc by default and lets it be enabled", () => {
    expect(resolveOptions({ host: "https://gitlab.com" }, "production").stripToc).toBe(false);
    expect(
      resolveOptions({ host: "https://gitlab.com", stripToc: true }, "production").stripToc,
    ).toBe(true);
  });

  it("accepts an outProcessors function array (and keeps it out of resolved)", () => {
    const resolved = resolveOptions(
      { host: "https://gitlab.com", outProcessors: [(md) => md] },
      "production",
    );
    expect("outProcessors" in resolved).toBe(false);
  });

  it("defaults includeAllowedHosts to an empty array", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "production");
    expect(o.includeAllowedHosts).toEqual([]);
  });

  it("passes through a configured includeAllowedHosts list", () => {
    const o = resolveOptions(
      { host: "https://gitlab.com", includeAllowedHosts: ["example.org"] },
      "production",
    );
    expect(o.includeAllowedHosts).toEqual(["example.org"]);
  });

  it("rejects a non-array includeAllowedHosts", () => {
    expect(() =>
      resolveOptions(
        { host: "https://gitlab.com", includeAllowedHosts: "example.org" } as any,
        "production",
      ),
    ).toThrow();
  });
});
