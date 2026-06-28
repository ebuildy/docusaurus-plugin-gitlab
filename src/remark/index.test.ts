import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, it, expect, vi } from "vitest";
import remarkGitlab from "./index";

vi.mock("../gitlab/fetchers.js", () => ({
  fetchProjectInfo: vi.fn(async (_c, a) => ({ id: 1, path: a.project, name: "r" })),
  fetchReadme: vi.fn(),
  fetchReleases: vi.fn(),
  fetchIssues: vi.fn(async () => {
    throw new Error("api down");
  }),
  fetchFile: vi.fn(),
}));

function processor(opts: any) {
  return unified().use(remarkParse).use(remarkMdx).use(remarkGitlab, opts);
}

async function transform(src: string, opts: any) {
  const p = processor(opts);
  const tree = p.parse(src);
  return (await p.run(tree, { path: "page.mdx" } as any)) as any;
}

describe("remarkGitlab", () => {
  it("injects a data prop on a registered element", async () => {
    const tree = await transform('<GitlabProjectInfo project="g/r" />', {
      host: "https://gitlab.com",
      strict: true,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabProjectInfo");
    const dataAttr = node.attributes.find((a: any) => a.name === "data");
    expect(dataAttr).toBeTruthy();
    expect(dataAttr.value.value).toContain("g/r");
  });

  it("ignores unregistered elements", async () => {
    const tree = await transform("<SomethingElse />", { host: "https://gitlab.com", strict: true });
    const node = tree.children.find((c: any) => c.name === "SomethingElse");
    expect(node.attributes.find((a: any) => a.name === "data")).toBeUndefined();
  });

  it("throws on fetch failure in strict mode", async () => {
    await expect(
      transform('<GitlabIssues project="g/r" />', { host: "https://gitlab.com", strict: true }),
    ).rejects.toThrow(/api down/);
  });

  it("injects an error prop on fetch failure in non-strict mode", async () => {
    const tree = await transform('<GitlabIssues project="g/r" />', {
      host: "https://gitlab.com",
      strict: false,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabIssues");
    const errAttr = node.attributes.find((a: any) => a.name === "error");
    expect(errAttr.value.value).toContain("api down");
  });
});
