import { describe, it, expect } from "vitest";
import { rewriteGeneratePages } from "./rewrite.js";

describe("rewriteGeneratePages", () => {
  it("rewrites the directive into a GitlabProjectGrid element with literal attrs", () => {
    const out = rewriteGeneratePages(
      `# Projects\n\n{@generateGitlabPages group=1 sections="info,readme" topics="x" includeSubgroups=true basePath="apps"}\n`,
    );
    expect(out).toContain(
      `<GitlabProjectGrid group="1" sections="info,readme" topics="x" includeSubgroups={true} includeArchived={false} basePath="apps" />`,
    );
    expect(out).not.toContain("{@generateGitlabPages");
  });

  it("returns the source unchanged when no directive is present", () => {
    const src = `# Just docs\n`;
    expect(rewriteGeneratePages(src)).toBe(src);
  });

  it("escapes double quotes in interpolated attribute values", () => {
    const out = rewriteGeneratePages(`{@generateGitlabPages group=1 topics='a"b'}`);
    expect(out).toContain('topics="a&quot;b"');
    expect(out).not.toContain('topics="a"b"');
  });
});
