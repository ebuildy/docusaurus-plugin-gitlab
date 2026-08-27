import { describe, it, expect } from "vitest";
import { resetSiteBaseUrl, setSiteBaseUrl } from "../gitlab/base-url.js";
import loader from "./loader.js";

function run(source: string, resolved: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = {
      async: () => (err: Error | null, out?: string) => (err ? reject(err) : resolve(out!)),
      getOptions: () => ({ resolved }),
      resourcePath: "/docs/x.mdx",
    };
    loader.call(ctx, source);
  });
}

describe("gitlab include loader", () => {
  it("passes through files with no placeholder untouched", async () => {
    const out = await run("# nothing here", { strict: true, host: "https://gl", cache: false });
    expect(out).toBe("# nothing here");
  });

  it("does not throw synchronously for placeholder files (delegates to async)", async () => {
    // lax mode: an offline fetch fails but is caught and rendered as an inline warning.
    const out = await run("{@includeGitlabReadme: g/p}", {
      strict: false,
      host: "http://127.0.0.1:1",
      token: undefined,
      cache: false,
      assetDir: "static/gitlab-assets",
      assetBaseUrl: "/gitlab-assets",
    });
    expect(out).toContain("> ⚠️");
  });

  it("rewrites a generateGitlabPages directive to <GitlabProjectGrid>", async () => {
    const out = await run(`{@generateGitlabPages group=1 sections="readme"}`, {
      strict: true,
      host: "https://gl",
      cache: false,
    });
    expect(out).toContain("<GitlabProjectGrid ");
    expect(out).not.toContain("{@generateGitlabPages");
  });

  it("masks the internal host on the no-placeholder fast path", async () => {
    const out = await run("clone from http://gitlab.internal:8080/g/r.git", {
      strict: true,
      host: "http://gitlab.internal:8080",
      gitlabPublicUrl: "https://gitlab.example.com",
      cache: false,
    });
    expect(out).toBe("clone from https://gitlab.example.com/g/r.git");
  });

  it("masks the internal host on the transformIncludes path", async () => {
    // The surrounding prose is copied through transformIncludes verbatim, so a
    // mask applied only inside that function would miss it. Deliberately does
    // NOT assert on the failure message's own text, which is network-dependent.
    const out = await run("see http://127.0.0.1:1/g/p\n\n{@includeGitlabReadme: g/p}", {
      strict: false,
      host: "http://127.0.0.1:1",
      gitlabPublicUrl: "https://gitlab.example.com",
      token: undefined,
      cache: false,
      assetDir: "static/gitlab-assets",
      assetBaseUrl: "/gitlab-assets",
    });
    expect(out).toContain("> ⚠️"); // proves we took the transformIncludes path
    expect(out).toContain("see https://gitlab.example.com/g/p");
  });

  it("leaves the source untouched when gitlabPublicUrl is unset", async () => {
    const src = "clone from http://gitlab.internal:8080/g/r.git";
    const out = await run(src, { strict: true, host: "http://gitlab.internal:8080", cache: false });
    expect(out).toBe(src);
  });
});

describe("localized asset URLs and the site baseUrl", () => {
  // The include path never renders through our React components, so `useBaseUrl`
  // could not fix it even in principle — the prefix has to be baked in here.
  const resolved = {
    strict: true,
    host: "https://gl",
    cache: false,
    assetBaseUrl: "/gitlab-assets",
  };

  it("prefixes asset URLs in page text with the reported baseUrl", async () => {
    resetSiteBaseUrl();
    setSiteBaseUrl("/my-docs/");
    const out = await run("![logo](/gitlab-assets/abc.png)", resolved);
    expect(out).toBe("![logo](/my-docs/gitlab-assets/abc.png)");
  });

  it("leaves asset URLs alone at the site root", async () => {
    resetSiteBaseUrl();
    setSiteBaseUrl("/");
    const out = await run("![logo](/gitlab-assets/abc.png)", resolved);
    expect(out).toBe("![logo](/gitlab-assets/abc.png)");
  });

  it("lets an explicit baseUrl option override the reported one", async () => {
    resetSiteBaseUrl();
    setSiteBaseUrl("/from-plugin/");
    const out = await run("![logo](/gitlab-assets/abc.png)", { ...resolved, baseUrl: "/explicit" });
    expect(out).toBe("![logo](/explicit/gitlab-assets/abc.png)");
  });
});
