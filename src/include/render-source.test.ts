import { describe, it, expect } from "vitest";
import { stripFrontmatter, codeRanges } from "./render-source.js";

describe("stripFrontmatter", () => {
  it("removes a leading YAML frontmatter block", () => {
    expect(stripFrontmatter("---\ntitle: x\n---\n# Hi")).toBe("# Hi");
  });
  it("leaves content without frontmatter untouched", () => {
    expect(stripFrontmatter("# Hi\n\n---\n\nrule")).toBe("# Hi\n\n---\n\nrule");
  });
});

describe("codeRanges", () => {
  it("reports fenced code block offsets", () => {
    const md = "a\n\n```ts\nconst x = 1;\n```\n\nb";
    const ranges = codeRanges(md);
    expect(ranges.length).toBe(1);
    const [start, end] = ranges[0];
    expect(md.slice(start, end)).toContain("const x = 1;");
  });
  it("reports inline code offsets", () => {
    const md = "use `code` here";
    const ranges = codeRanges(md);
    expect(md.slice(ranges[0][0], ranges[0][1])).toBe("`code`");
  });
});
