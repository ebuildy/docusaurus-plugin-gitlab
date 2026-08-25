import { describe, expect, it } from "vitest";
import { rewriteRelativeLinks } from "./rewrite-links.js";

describe("rewriteRelativeLinks", () => {
  it("rewrites a repo-relative link in gitlab mode", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    expect(await proc("[a](./b.md)")).toBe("[a](https://gitlab.com/g/p/-/blob/main/b.md)");
  });

  it("rewrites the url of a link with a title, preserving the title", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    expect(await proc('[a](./b.md "Tee")')).toBe(
      '[a](https://gitlab.com/g/p/-/blob/main/b.md "Tee")',
    );
  });

  it("rewrites an angle-bracket url, keeping it wrapped", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    expect(await proc("[a](<./b.md>)")).toBe("[a](<https://gitlab.com/g/p/-/blob/main/b.md>)");
  });

  it("leaves an absolute link untouched", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "[a](https://example.com/x)";
    expect(await proc(md)).toBe(md);
  });

  it("leaves an anchor link untouched", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "[a](#section)";
    expect(await proc(md)).toBe(md);
  });

  it("leaves a mailto link untouched", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "[a](mailto:x@y.com)";
    expect(await proc(md)).toBe(md);
  });

  it("rewrites a reference-style definition", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const out = await proc("[a][id]\n\n[id]: ./b.md");
    expect(out).toContain("[id]: https://gitlab.com/g/p/-/blob/main/b.md");
  });

  it("leaves an image untouched (out of scope)", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "![logo](./logo.png)";
    expect(await proc(md)).toBe(md);
  });

  it("leaves a link inside a fenced code block untouched", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "```md\n[a](./b.md)\n```";
    expect(await proc(md)).toBe(md);
  });

  it("leaves a link inside inline code untouched", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "text `[a](./b.md)` more";
    expect(await proc(md)).toBe(md);
  });

  it("resolves a link with a nested basePath against the repo root using ..", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
      basePath: "docs/a.md",
    });
    expect(await proc("[a](../top.md)")).toBe("[a](https://gitlab.com/g/p/-/blob/main/top.md)");
  });

  it("rewrites a relative link in site mode with a linkBase, stripping the extension", async () => {
    const proc = rewriteRelativeLinks({
      mode: "site",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
      linkBase: "/repo",
    });
    expect(await proc("[a](./docs/x.md)")).toBe("[a](/repo/docs/x)");
  });

  it("rewrites multiple links in one document, all correctly (proves backwards splicing)", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "[a](./a.md) then [b](./b.md) then [c](./c.md)";
    expect(await proc(md)).toBe(
      "[a](https://gitlab.com/g/p/-/blob/main/a.md) then " +
        "[b](https://gitlab.com/g/p/-/blob/main/b.md) then " +
        "[c](https://gitlab.com/g/p/-/blob/main/c.md)",
    );
  });

  it("handles a link whose label contains inline code without mis-splitting the pattern", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    expect(await proc("[`SKILL.md`](skills/a/SKILL.md)")).toBe(
      "[`SKILL.md`](https://gitlab.com/g/p/-/blob/main/skills/a/SKILL.md)",
    );
  });

  it("returns markdown with no links byte-identical", async () => {
    const proc = rewriteRelativeLinks({
      mode: "gitlab",
      publicUrl: "https://gitlab.com",
      project: "g/p",
      ref: "main",
    });
    const md = "# Title\n\nJust some prose, no links here.\n";
    expect(await proc(md)).toBe(md);
  });
});
