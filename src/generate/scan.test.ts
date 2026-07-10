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
  it("finds the directive and targets the declaring page's own folder", () => {
    const { docs } = site();
    writeFileSync(join(docs, "index.mdx"), `# Projects\n\n{@generateGitlabPages group=1}\n`);
    writeFileSync(join(docs, "sub", "other.md"), `no directive here`);

    const hits = scanGeneratePages(docs);
    expect(hits).toHaveLength(1);
    expect(hits[0].file).toBe(join(docs, "index.mdx"));
    expect(hits[0].spec.group).toBe("1");
    expect(hits[0].targetDir).toBe(docs);
  });

  it("targets the folder containing a nested declaring page", () => {
    const { docs } = site();
    writeFileSync(join(docs, "sub", "index.mdx"), `{@generateGitlabPages group=7}`);
    const hits = scanGeneratePages(docs);
    expect(hits[0].targetDir).toBe(join(docs, "sub"));
  });

  it("returns nothing when the docs dir has no directive", () => {
    const { docs } = site();
    writeFileSync(join(docs, "plain.mdx"), `just docs`);
    expect(scanGeneratePages(docs)).toEqual([]);
  });
});
