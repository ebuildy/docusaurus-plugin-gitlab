import { describe, it, expect } from "vitest";
import { transformIncludes } from "./transform.js";

function makeCtx() {
  const store = new Map<string, unknown>();
  return {
    client: {
      getProject: async () => ({ default_branch: "main" }),
      getFileRaw: async (_p: unknown, path: string) =>
        path === "README.md" ? "# Title\n\nbody {x}" : "const a = 1;\nconst b = 2;\n",
    },
    cache: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) },
    assets: { localize: async (u: string) => `/a/${u}` },
    options: { host: "https://gl" },
  } as any;
}

const strict = { strict: true } as any;
const lax = { strict: false } as any;

describe("transformIncludes", () => {
  it("returns source unchanged when no placeholder", async () => {
    expect(await transformIncludes("# plain", makeCtx(), strict)).toBe("# plain");
  });

  it("replaces a readme placeholder with escaped markdown", async () => {
    const out = await transformIncludes("intro\n\n{@includeGitlabReadme: g/p}\n\nend", makeCtx(), strict);
    expect(out).toContain("# Title");
    expect(out).toContain("body &#123;x&#125;");
    expect(out).not.toContain("{@includeGitlabReadme");
  });

  it("replaces a file placeholder with a fenced block", async () => {
    const out = await transformIncludes("{@includeGitlabFile: g/p/-/src/a.ts#L1-1}", makeCtx(), strict);
    expect(out).toContain("```ts");
    expect(out).toContain("const a = 1;");
    expect(out).not.toContain("const b = 2;"); // line range applied
  });

  it("throws in strict mode on a malformed placeholder", async () => {
    await expect(transformIncludes("{@includeGitlabFile: g/p}", makeCtx(), strict)).rejects.toThrow();
  });

  it("emits an inline warning in lax mode on a malformed placeholder", async () => {
    const out = await transformIncludes("{@includeGitlabFile: g/p}", makeCtx(), lax);
    expect(out).toContain("> ⚠️");
    expect(out).toContain("failed");
  });

  it("does not re-substitute a placeholder that appears inside another include's body", async () => {
    const ctx = {
      client: {
        getProject: async () => ({ default_branch: "main" }),
        getFileRaw: async (_p: unknown, path: string) =>
          path === "demo.txt"
            ? "Example: {@includeGitlabReadme: g/p}"
            : "# Title",
      },
      cache: { get: async () => undefined, set: async () => {} },
      assets: { localize: async (u: string) => `/a/${u}` },
      options: { host: "https://gl" },
    } as any;

    const source = "{@includeGitlabFile: g/p/-/demo.txt}\n\n{@includeGitlabReadme: g/p}";
    const out = await transformIncludes(source, ctx, { strict: true } as any);

    // The literal placeholder text inside the code file's fenced body must survive verbatim,
    // NOT be replaced by the README's rendered content.
    expect(out).toContain("Example: {@includeGitlabReadme: g/p}");
    // And the real second placeholder IS resolved to the README.
    expect(out).toContain("# Title");
  });

  it("applies the autolink fix to a markdown include's generated body", async () => {
    const ctx = {
      client: {
        getProject: async () => ({ default_branch: "main" }),
        getFileRaw: async () => "Email: <a@b.com>",
      },
      cache: { get: async () => undefined, set: async () => {} },
      assets: { localize: async (u: string) => u },
      options: { host: "https://gl" },
    } as any;
    const out = await transformIncludes("{@includeGitlabReadme: g/p}", ctx, {
      strict: true,
      fixAutolinks: true,
    });
    expect(out).toContain("[a@b.com](mailto:a@b.com)");
    expect(out).not.toContain("<a@b.com>");
  });

  it("self-closes void tags in a markdown include via the built-in fix", async () => {
    const ctx = {
      client: {
        getProject: async () => ({ default_branch: "main" }),
        getFileRaw: async () => "line one<br>line two",
      },
      cache: { get: async () => undefined, set: async () => {} },
      assets: { localize: async (u: string) => u },
      options: { host: "https://gl" },
    } as any;
    const out = await transformIncludes("{@includeGitlabReadme: g/p}", ctx, {
      strict: true,
      fixVoidTags: true,
    });
    expect(out).toContain("line one<br />line two");
    expect(out).not.toMatch(/<br>/);
  });

  it("strips a Table of Contents section when stripToc is enabled", async () => {
    const ctx = {
      client: {
        getProject: async () => ({ default_branch: "main" }),
        getFileRaw: async () => "# T\n\n## Table of Contents\n\n- [Install](#install)\n\n## Install\n\nsetup",
      },
      cache: { get: async () => undefined, set: async () => {} },
      assets: { localize: async (u: string) => u },
      options: { host: "https://gl" },
    } as any;
    const out = await transformIncludes("{@includeGitlabReadme: g/p}", ctx, {
      strict: true,
      stripToc: true,
    });
    expect(out).not.toContain("Table of Contents");
    expect(out).not.toContain("[Install](#install)");
    expect(out).toContain("## Install");
  });

  it("runs a user outProcessor after the built-in fix, in order", async () => {
    const ctx = {
      client: {
        getProject: async () => ({ default_branch: "main" }),
        getFileRaw: async () => "x",
      },
      cache: { get: async () => undefined, set: async () => {} },
      assets: { localize: async (u: string) => u },
      options: { host: "https://gl" },
    } as any;
    const out = await transformIncludes("{@includeGitlabReadme: g/p}", ctx, {
      strict: true,
      outProcessors: [(md) => `${md.trim()} [processed]`],
    });
    expect(out).toContain("x [processed]");
  });

  it("does not run processors on a code-file include", async () => {
    const ctx = {
      client: {
        getProject: async () => ({ default_branch: "main" }),
        getFileRaw: async () => "url := <a@b.com>\n",
      },
      cache: { get: async () => undefined, set: async () => {} },
      assets: { localize: async (u: string) => u },
      options: { host: "https://gl" },
    } as any;
    const out = await transformIncludes("{@includeGitlabFile: g/p/-/main.go}", ctx, {
      strict: true,
      fixAutolinks: true,
    });
    // Code content is fenced verbatim — the autolink-looking text is left as-is.
    expect(out).toContain("url := <a@b.com>");
  });
});
