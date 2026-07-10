import { describe, it, expect } from "vitest";
import { rewriteGeneratePages } from "./rewrite.js";

describe("rewriteGeneratePages", () => {
  it("rewrites the directive into a GitlabProjectGrid element with literal attrs and the given linkBase", () => {
    const out = rewriteGeneratePages(
      `# Projects\n\n{@generateGitlabPages group=1 sections="info,readme" topics="x" includeSubgroups=true}\n`,
      "team",
    );
    expect(out).toContain(
      `<GitlabProjectGrid group="1" sections="info,readme" topics="x" includeSubgroups={true} includeArchived={false} linkBase="team" />`,
    );
    expect(out).not.toContain("{@generateGitlabPages");
  });

  it("emits an empty linkBase when none is provided", () => {
    const out = rewriteGeneratePages(`{@generateGitlabPages group=1}`);
    expect(out).toContain(`linkBase="" />`);
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
