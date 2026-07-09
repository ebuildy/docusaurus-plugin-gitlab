import { describe, it, expect } from "vitest";
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
});
