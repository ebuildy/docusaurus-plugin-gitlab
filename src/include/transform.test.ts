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
});
