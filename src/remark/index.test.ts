import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { describe, it, expect, vi } from "vitest";
import { findTocExport, readTocItems } from "./toc-export";
import remarkGitlab from "./index";

vi.mock("../gitlab/fetchers.js", () => ({
  fetchProjectInfo: vi.fn(async (_c, a) => ({ id: 1, path: a.project, name: "r" })),
  fetchReadme: vi.fn(),
  fetchReleases: vi.fn(),
  fetchIssues: vi.fn(async () => {
    throw new Error("api down");
  }),
  fetchFile: vi.fn(),
  fetchTopics: vi.fn(),
  fetchLabels: vi.fn(),
  fetchGroupProjects: vi.fn(),
  fetchRoadmap: vi.fn(),
  fetchUser: vi.fn(),
  fetchUsers: vi.fn(),
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

  it("merges sidebar README headings into the page toc export", async () => {
    const { fetchReadme } = await import("../gitlab/fetchers.js");
    (fetchReadme as any).mockResolvedValue({
      ref: "main",
      html: '<h2 id="install">Install</h2>',
      toc: [{ level: 2, id: "install", text: "Install" }],
    });
    const src = [
      'export const toc = [{ value: "Intro", id: "intro", level: 2, children: [] }];',
      "",
      '<GitlabReadme project="g/r" toc="sidebar" />',
    ].join("\n");
    const tree = await transform(src, { host: "https://gitlab.com", strict: true });
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i: any) => i.id)).toContain("install");
  });

  it("does not touch the toc export for non-sidebar readmes", async () => {
    const { fetchReadme } = await import("../gitlab/fetchers.js");
    (fetchReadme as any).mockResolvedValue({ ref: "main", html: "<p>x</p>" });
    const src = [
      'export const toc = [{ value: "Intro", id: "intro", level: 2, children: [] }];',
      "",
      '<GitlabReadme project="g/r" toc="inline" />',
    ].join("\n");
    const tree = await transform(src, { host: "https://gitlab.com", strict: true });
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i: any) => i.id)).toEqual(["intro"]);
  });

  it("masks the internal host in injected data when gitlabPublicUrl is set", async () => {
    const { fetchProjectInfo } = await import("../gitlab/fetchers.js");
    (fetchProjectInfo as any).mockResolvedValueOnce({
      id: 1,
      path: "g/r",
      name: "r",
      webUrl: "http://gitlab.internal:8080/g/r",
    });
    const tree = await transform('<GitlabProjectInfo project="g/r" />', {
      host: "http://gitlab.internal:8080",
      gitlabPublicUrl: "https://gitlab.example.com",
      strict: true,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabProjectInfo");
    const dataAttr = node.attributes.find((a: any) => a.name === "data");
    expect(dataAttr.value.value).toContain("https://gitlab.example.com/g/r");
    expect(dataAttr.value.value).not.toContain("gitlab.internal");
  });

  it("masks the internal host in an injected error prop", async () => {
    const { fetchIssues } = await import("../gitlab/fetchers.js");
    (fetchIssues as any).mockRejectedValueOnce(
      new Error("connect ECONNREFUSED http://gitlab.internal:8080/api/v4/projects"),
    );
    const tree = await transform('<GitlabIssues project="g/r" />', {
      host: "http://gitlab.internal:8080",
      gitlabPublicUrl: "https://gitlab.example.com",
      strict: false,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabIssues");
    const errAttr = node.attributes.find((a: any) => a.name === "error");
    expect(errAttr.value.value).toContain("https://gitlab.example.com/api/v4/projects");
    expect(errAttr.value.value).not.toContain("gitlab.internal");
  });

  it("leaves injected data untouched when gitlabPublicUrl is unset", async () => {
    const { fetchProjectInfo } = await import("../gitlab/fetchers.js");
    (fetchProjectInfo as any).mockResolvedValueOnce({
      id: 1,
      path: "g/r",
      name: "r",
      webUrl: "http://gitlab.internal:8080/g/r",
    });
    const tree = await transform('<GitlabProjectInfo project="g/r" />', {
      host: "http://gitlab.internal:8080",
      strict: true,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabProjectInfo");
    const dataAttr = node.attributes.find((a: any) => a.name === "data");
    expect(dataAttr.value.value).toContain("http://gitlab.internal:8080/g/r");
  });

  it("masks a sidebar README's data while the toc export still gets wired", async () => {
    const { fetchReadme } = await import("../gitlab/fetchers.js");
    (fetchReadme as any).mockResolvedValueOnce({
      ref: "main",
      html: '<h2 id="install">Install</h2><p><a href="http://gitlab.internal:8080/g/r">g/r</a></p>',
      toc: [{ level: 2, id: "install", text: "Install" }],
    });
    const src = [
      'export const toc = [{ value: "Intro", id: "intro", level: 2, children: [] }];',
      "",
      '<GitlabReadme project="g/r" toc="sidebar" />',
    ].join("\n");
    const tree = await transform(src, {
      host: "http://gitlab.internal:8080",
      gitlabPublicUrl: "https://gitlab.example.com",
      strict: true,
    });

    const node = tree.children.find((c: any) => c.name === "GitlabReadme");
    const dataAttr = node.attributes.find((a: any) => a.name === "data");
    expect(dataAttr.value.value).toContain("https://gitlab.example.com/g/r");
    expect(dataAttr.value.value).not.toContain("gitlab.internal");

    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i: any) => i.id)).toContain("install");
  });
});
