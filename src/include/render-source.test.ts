import { describe, it, expect } from "vitest";
import {
  stripFrontmatter,
  codeRanges,
  transformProse,
  escapeMdx,
  processMarkdownSource,
  renderSource,
} from "./render-source.js";

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

describe("processMarkdownSource", () => {
  it("escapes prose but leaves fenced code verbatim", async () => {
    const md = "Set {x}.\n\n```ts\nconst y = {a: 1};\n```\n";
    const out = await processMarkdownSource(md, helpers);
    expect(out).toContain("Set &#123;x&#125;.");
    expect(out).toContain("const y = {a: 1};"); // untouched inside the fence
  });
  it("leaves inline code verbatim", async () => {
    const out = await processMarkdownSource("use `{a}` now", helpers);
    expect(out).toBe("use `{a}` now");
  });
});

describe("renderSource", () => {
  const ctx = {
    assets: { localize: async (u: string) => `/gitlab-assets/${u.replace(/[^a-z0-9.]/gi, "_")}` },
    options: { host: "https://gl" },
  } as any;

  it("renders a readme as escaped markdown", async () => {
    const out = await renderSource("# T\n\nuse {x}", { ctx, project: "g/p", ref: "main", kind: "readme" });
    expect(out).toContain("# T");
    expect(out).toContain("use &#123;x&#125;");
  });

  it("wraps a code file in a fence with inferred language", async () => {
    const out = await renderSource("const a = 1;\nconst b = 2;\n", {
      ctx, project: "g/p", ref: "main", kind: "file", path: "src/a.ts",
    });
    expect(out).toBe("\n```ts\nconst a = 1;\nconst b = 2;\n\n```\n");
  });

  it("applies a line range to a code file", async () => {
    const out = await renderSource("l1\nl2\nl3\nl4", {
      ctx, project: "g/p", ref: "main", kind: "file", path: "a.ts", lineRange: "2-3",
    });
    expect(out).toBe("\n```ts\nl2\nl3\n```\n");
  });

  it("renders a markdown file as markdown (not a fence)", async () => {
    const out = await renderSource("# Doc\n\nhi {y}", {
      ctx, project: "g/p", ref: "main", kind: "file", path: "docs/x.md",
    });
    expect(out).toContain("# Doc");
    expect(out).toContain("hi &#123;y&#125;");
  });
});
