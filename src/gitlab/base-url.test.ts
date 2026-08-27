import { describe, expect, it, beforeEach } from "vitest";
import {
  createAssetBaseUrlPrefixer,
  normalizeBaseUrl,
  prefixAssetUrlsDeep,
  resetSiteBaseUrl,
  setSiteBaseUrl,
  siteBaseUrl,
} from "./base-url.js";

describe("normalizeBaseUrl", () => {
  it("treats the site root as no prefix", () => {
    expect(normalizeBaseUrl("/")).toBe("");
    expect(normalizeBaseUrl("")).toBe("");
    expect(normalizeBaseUrl(undefined)).toBe("");
  });

  it("strips the trailing slash Docusaurus always adds", () => {
    expect(normalizeBaseUrl("/my-docs/")).toBe("/my-docs");
    expect(normalizeBaseUrl("/a/b/")).toBe("/a/b");
  });

  it("adds the leading slash when the author omitted it", () => {
    expect(normalizeBaseUrl("my-docs")).toBe("/my-docs");
  });

  it("collapses a pathological run of trailing slashes in linear time", () => {
    // Guards against the backtracking a `/\/+$/` regex invites (CodeQL
    // js/polynomial-redos): quadratic here would not return in a test run.
    const started = Date.now();
    expect(normalizeBaseUrl(`/my-docs${"/".repeat(100_000)}`)).toBe("/my-docs");
    expect(normalizeBaseUrl("/".repeat(100_000))).toBe("");
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("createAssetBaseUrlPrefixer", () => {
  it("prefixes site-absolute asset URLs with the site baseUrl", () => {
    const prefix = createAssetBaseUrlPrefixer("/gitlab-assets", "/my-docs");
    expect(prefix('<img src="/gitlab-assets/abc.png">')).toBe('<img src="/my-docs/gitlab-assets/abc.png">');
    expect(prefix("![logo](/gitlab-assets/abc.png)")).toBe("![logo](/my-docs/gitlab-assets/abc.png)");
  });

  it("is a no-op at the site root", () => {
    const prefix = createAssetBaseUrlPrefixer("/gitlab-assets", "");
    expect(prefix.disabled).toBe(true);
    expect(prefix('src="/gitlab-assets/abc.png"')).toBe('src="/gitlab-assets/abc.png"');
  });

  it("is a no-op when assetBaseUrl is an absolute URL (CDN)", () => {
    const prefix = createAssetBaseUrlPrefixer("https://cdn.example.com/a", "/my-docs");
    expect(prefix.disabled).toBe(true);
  });

  it("does not double-prefix an assetBaseUrl that already carries the baseUrl", () => {
    const prefix = createAssetBaseUrlPrefixer("/my-docs/gitlab-assets", "/my-docs");
    expect(prefix('src="/my-docs/gitlab-assets/abc.png"')).toBe('src="/my-docs/gitlab-assets/abc.png"');
  });

  it("only matches at a path-segment boundary", () => {
    const prefix = createAssetBaseUrlPrefixer("/gitlab-assets", "/my-docs");
    // a longer, unrelated directory must not be rewritten
    expect(prefix('src="/gitlab-assets-other/abc.png"')).toBe('src="/gitlab-assets-other/abc.png"');
    // and neither must a URL that merely contains the path further along
    expect(prefix("https://x.test/gitlab-assets/abc.png")).toBe("https://x.test/gitlab-assets/abc.png");
  });

  it("does not treat regex metacharacters in the path as a pattern", () => {
    const prefix = createAssetBaseUrlPrefixer("/gitlab+assets", "/my-docs");
    expect(prefix('src="/gitlab+assets/abc.png"')).toBe('src="/my-docs/gitlab+assets/abc.png"');
  });

  it("does not let a `$` in the baseUrl trigger replacement patterns", () => {
    const prefix = createAssetBaseUrlPrefixer("/gitlab-assets", "/a$&b");
    expect(prefix('src="/gitlab-assets/x.png"')).toBe('src="/a$&b/gitlab-assets/x.png"');
  });
});

describe("prefixAssetUrlsDeep", () => {
  it("walks nested props, leaving non-strings alone", () => {
    const prefix = createAssetBaseUrlPrefixer("/gitlab-assets", "/my-docs");
    const data = {
      avatarUrl: "/gitlab-assets/a.png",
      starCount: 12,
      readme: { html: '<img src="/gitlab-assets/b.png">' },
      links: [{ url: "/gitlab-assets/c.png" }],
    };
    expect(prefixAssetUrlsDeep(data, prefix)).toEqual({
      avatarUrl: "/my-docs/gitlab-assets/a.png",
      starCount: 12,
      readme: { html: '<img src="/my-docs/gitlab-assets/b.png">' },
      links: [{ url: "/my-docs/gitlab-assets/c.png" }],
    });
  });

  it("returns the same reference when the prefixer is disabled", () => {
    const prefix = createAssetBaseUrlPrefixer("/gitlab-assets", "");
    const data = { avatarUrl: "/gitlab-assets/a.png" };
    expect(prefixAssetUrlsDeep(data, prefix)).toBe(data);
  });
});

describe("the site baseUrl registry", () => {
  beforeEach(() => resetSiteBaseUrl());

  it("is empty until the Docusaurus plugin reports one", () => {
    expect(siteBaseUrl()).toBeUndefined();
  });

  it("normalizes what the plugin reports", () => {
    setSiteBaseUrl("/my-docs/");
    expect(siteBaseUrl()).toBe("/my-docs");
  });
});
