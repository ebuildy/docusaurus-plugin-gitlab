import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { scanGeneratePages } from "./scan.js";

function site() {
  const root = mkdtempSync(join(tmpdir(), "glscan-"));
  const docs = join(root, "docs");
  mkdirSync(join(docs, "sub"), { recursive: true });
  return { docs };
}

describe("scanGeneratePages", () => {
  it("finds the directive and computes its target dir from basePath", () => {
    const { docs } = site();
    writeFileSync(join(docs, "index.mdx"), `# Projects\n\n{@generateGitlabPages group=1 basePath="apps"}\n`);
    writeFileSync(join(docs, "sub", "other.md"), `no directive here`);

    const hits = scanGeneratePages(docs);
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe(join(docs, "index.mdx"));
    expect(hits[0].spec.group).toBe("1");
    expect(hits[0].targetDir).toBe(join(docs, "apps"));
  });

  it("defaults the target dir to <fileDir>/projects", () => {
    const { docs } = site();
    writeFileSync(join(docs, "sub", "page.mdx"), `{@generateGitlabPages group=7}`);
    const hits = scanGeneratePages(docs);
    expect(hits[0].targetDir).toBe(join(docs, "sub", "projects"));
  });

  it("returns nothing when the docs dir has no directive", () => {
    const { docs } = site();
    writeFileSync(join(docs, "plain.mdx"), `just docs`);
    expect(scanGeneratePages(docs)).toEqual([]);
  });
});
