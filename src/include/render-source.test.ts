import { describe, it, expect } from "vitest";
import { stripFrontmatter, codeRanges, transformProse, escapeMdx } from "./render-source.js";

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

const helpers = {
  localizeImage: async (u: string) => `/gitlab-assets/${u.replace(/[^a-z0-9.]/gi, "_")}`,
  absolutizeLink: (u: string) => `https://gl/g/p/-/blob/main/${u.replace(/^\.?\//, "")}`,
};

describe("escapeMdx", () => {
  it("neutralizes curly braces with entities", () => {
    expect(escapeMdx("a {x} b")).toBe("a &#123;x&#125; b");
  });
  it("escapes a stray < but keeps real tags", () => {
    expect(escapeMdx("a < b and <img> and </p> and <!-- c -->"))
      .toBe("a &lt; b and <img> and </p> and <!-- c -->");
  });
});

describe("transformProse", () => {
  it("localizes a relative markdown image", async () => {
    expect(await transformProse("![logo](./logo.png)", helpers))
      .toBe("![logo](/gitlab-assets/._logo.png)");
  });
  it("leaves an absolute image untouched", async () => {
    expect(await transformProse("![x](https://h/i.png)", helpers))
      .toBe("![x](https://h/i.png)");
  });
  it("absolutizes a repo-relative link", async () => {
    expect(await transformProse("[c](./CONTRIBUTING.md)", helpers))
      .toBe("[c](https://gl/g/p/-/blob/main/CONTRIBUTING.md)");
  });
  it("leaves anchors and external links untouched", async () => {
    expect(await transformProse("[a](#sec) [b](https://x)", helpers))
      .toBe("[a](#sec) [b](https://x)");
  });
  it("localizes an html img src", async () => {
    expect(await transformProse('<img src="./a.png">', helpers))
      .toBe('<img src="/gitlab-assets/._a.png">');
  });
  it("localizes a multi-line html img src", async () => {
    expect(await transformProse('<img\n  alt="x"\n  src="./a.png">', helpers))
      .toBe('<img\n  alt="x"\n  src="/gitlab-assets/._a.png">');
  });
});
