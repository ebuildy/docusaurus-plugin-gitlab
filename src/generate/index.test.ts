import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { FileCache } from "../gitlab/cache.js";
import { generateAll } from "./index.js";

function ctx() {
  const dir = mkdtempSync(join(tmpdir(), "glorch-"));
  const client = {
    getGroup: vi.fn(async () => ({ full_path: "mygroup", name: "My Group" })),
    getGroupProjects: vi.fn(async () => [
      { id: 1, name: "Web", path: "acme-web", path_with_namespace: "mygroup/acme-web", description: null, web_url: "", star_count: 0, default_branch: "main", topics: [] },
    ]),
  };
  return {
    client,
    cache: new FileCache(join(dir, "c"), { ttl: 60 }),
    options: { host: "https://gitlab.com" },
    assets: { localize: vi.fn() },
  } as any;
}

describe("generateAll", () => {
  it("generates a page tree for each directive using the group name as label", async () => {
    const c = ctx();
    const root = mkdtempSync(join(tmpdir(), "glsite-"));
    const docs = join(root, "docs");
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, "index.mdx"), `{@generateGitlabPages group=1 sections="readme"}`);

    const result = await generateAll(c, docs, { strict: true });

    expect(result.pagesWritten).toBe(1);
    expect(existsSync(join(docs, "projects", "acme-web.mdx"))).toBe(true);
    expect(c.client.getGroupProjects).toHaveBeenCalled();
  });

  it("does nothing when there are no directives", async () => {
    const c = ctx();
    const docs = mkdtempSync(join(tmpdir(), "glempty-"));
    const result = await generateAll(c, docs, { strict: true });
    expect(result.pagesWritten).toBe(0);
  });

  it("rethrows a hit failure in strict mode", async () => {
    const c = ctx();
    c.client.getGroup = vi.fn(async () => { throw new Error("boom"); });
    const docs = mkdtempSync(join(tmpdir(), "glstrict-"));
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, "index.mdx"), `{@generateGitlabPages group=1}`);
    await expect(generateAll(c, docs, { strict: true })).rejects.toThrow(/boom/);
  });

  it("logs and skips a hit failure when not strict", async () => {
    const c = ctx();
    c.client.getGroup = vi.fn(async () => { throw new Error("boom"); });
    const docs = mkdtempSync(join(tmpdir(), "glnostrict-"));
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, "index.mdx"), `{@generateGitlabPages group=1}`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await generateAll(c, docs, { strict: false });
    expect(result.pagesWritten).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
