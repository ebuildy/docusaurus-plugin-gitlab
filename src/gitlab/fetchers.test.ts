import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import rehypeRaw from "rehype-raw";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { describe, it, expect, vi } from "vitest";
import { FileCache } from "./cache";
import { fetchProjectInfo, fetchReleases, fetchIssues, fetchReadme, fetchFile, fetchTopics, fetchLabels } from "./fetchers";

function ctx(client: any) {
  const dir = mkdtempSync(join(tmpdir(), "glfetch-"));
  return {
    client,
    cache: new FileCache(join(dir, "c"), { ttl: 60 }),
    options: { host: "https://gitlab.com", assetDir: join(dir, "a"), assetBaseUrl: "/gitlab-assets" },
    assets: { localize: vi.fn(async (src: string) => `/gitlab-assets/${src.replace(/\W/g, "")}.png`) },
  } as any;
}

describe("fetchProjectInfo", () => {
  it("normalizes the project payload", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "ship **it** :rocket:", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: ["x"], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      })),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(data).toMatchObject({ id: 7, path: "g/r", starCount: 3, topics: ["x"] });
    expect(data.descriptionHtml).toContain("<strong>it</strong>");
    expect(data.descriptionHtml).toContain("🚀");
    expect(data.avatarUrl).toBeNull();
    expect(c.assets.localize).not.toHaveBeenCalled();
    expect(client.getProject).toHaveBeenCalledWith("g/r");
  });

  it("localizes the avatar when the project has one", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: ["x"], last_activity_at: "2026-01-01T00:00:00Z",
        avatar_url: "https://gitlab.com/uploads/avatar.png",
      })),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(c.assets.localize).toHaveBeenCalledWith("https://gitlab.com/uploads/avatar.png", "", "g/r");
    expect(data.avatarUrl).toBe("/gitlab-assets/httpsgitlabcomuploadsavatarpng.png");
  });
});

describe("fetchReleases", () => {
  it("normalizes releases, renders notes, and respects limit", async () => {
    const client = {
      getReleases: vi.fn(async () => [
        { name: "v1", tag_name: "v1", released_at: "2026-01-01T00:00:00Z", description: "**notes**",
          upcoming_release: false, assets: { links: [{ name: "bin", url: "https://x/bin" }] } },
      ]),
    };
    const data = await fetchReleases(ctx(client), { project: "g/r", limit: 5, includePrereleases: true });
    expect(data).toHaveLength(1);
    expect(data[0].tagName).toBe("v1");
    expect(data[0].descriptionHtml).toContain("<strong>notes</strong>");
    expect(data[0].assets).toEqual([{ name: "bin", url: "https://x/bin" }]);
    expect(client.getReleases).toHaveBeenCalledWith("g/r", 5);
  });

  it("filters out upcoming releases unless includePrereleases", async () => {
    const client = {
      getReleases: vi.fn(async () => [
        { name: "rc", tag_name: "rc", released_at: "x", description: "", upcoming_release: true, assets: { links: [] } },
        { name: "v1", tag_name: "v1", released_at: "x", description: "", upcoming_release: false, assets: { links: [] } },
      ]),
    };
    const data = await fetchReleases(ctx(client), { project: "g/r" });
    expect(data.map((r) => r.tagName)).toEqual(["v1"]);
  });

  it("applies a configured markdownRenderChain to release notes", async () => {
    const client = {
      getReleases: vi.fn(async () => [
        { name: "v1", tag_name: "v1", released_at: "x", description: '<b onclick="e()">n</b>',
          upcoming_release: false, assets: { links: [] } },
      ]),
    };
    const c = ctx(client);
    c.options.markdownRenderChain = [remarkParse, [remarkRehype, { allowDangerousHtml: true }], rehypeRaw];
    const data = await fetchReleases(c, { project: "g/r", includePrereleases: true });
    expect(data[0].descriptionHtml).toContain("onclick");
  });
});

describe("fetchIssues", () => {
  it("normalizes issues and forwards filters", async () => {
    const client = {
      getIssues: vi.fn(async () => [
        { iid: 5, title: "bug", state: "opened", web_url: "https://x/5", labels: ["bug"],
          author: { name: "Ann", web_url: "https://x/ann" }, created_at: "2026-01-01T00:00:00Z" },
      ]),
    };
    const data = await fetchIssues(ctx(client), { project: "g/r", labels: "bug", state: "opened", limit: 10 });
    expect(data[0]).toMatchObject({ iid: 5, authorName: "Ann", labels: ["bug"] });
    expect(client.getIssues).toHaveBeenCalledWith(
      "g/r",
      { state: "opened", labels: "bug", milestone: undefined, limit: 10 },
    );
  });
});

describe("fetchReadme", () => {
  it("resolves default branch, renders html, and localizes images", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "![logo](./logo.png)"),
    };
    const c = ctx(client);
    const data = await fetchReadme(c, { project: "g/r" });
    expect(data.ref).toBe("main");
    expect(data.html).toContain('src="/gitlab-assets/');
    expect(client.getProject).toHaveBeenCalledWith("g/r");
    expect(client.getFileRaw).toHaveBeenCalledWith("g/r", "README.md", "main");
    expect(c.assets.localize).toHaveBeenCalledWith("./logo.png", "main", "g/r");
  });

  it("uses the explicit ref without calling getProject", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "no images here"),
    };
    const c = ctx(client);
    const data = await fetchReadme(c, { project: "g/r", ref: "v2" });
    expect(data.ref).toBe("v2");
    expect(client.getProject).not.toHaveBeenCalled();
    expect(client.getFileRaw).toHaveBeenCalledWith("g/r", "README.md", "v2");
  });

  it("expands ::include directives in the README before rendering", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async (_p: unknown, path: string) => {
        if (path === "README.md") return "# Title\n\n::include{file=chapter1.md}\n";
        if (path === "chapter1.md") return "Chapter one body.";
        throw new Error(`unexpected ${path}`);
      }),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r" });
    expect(data.html).toContain("Chapter one body.");
    expect(data.html).not.toContain("::include");
    expect(client.getFileRaw).toHaveBeenCalledWith("g/r", "chapter1.md", "main");
  });

  it("inserts a non-markdown ::include target inside its code fence verbatim", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async (_p: unknown, path: string) => {
        if (path === "README.md") return "## Config\n\n```yaml\n::include{file=profiles.yaml}\n```\n";
        if (path === "profiles.yaml") return "name: prod\nport: 8080";
        throw new Error(`unexpected ${path}`);
      }),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r" });
    expect(data.html).toContain("name: prod");
    expect(data.html).not.toContain("::include");
  });

  it("sidebar mode returns toc entries and assigns heading ids", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n\n### Steps\n"),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r", toc: "sidebar" });
    expect(data.toc).toEqual([
      { level: 2, id: "install", text: "Install" },
      { level: 3, id: "steps", text: "Steps" },
    ]);
    expect(data.html).toContain('<h2 id="install">');
  });

  it("does not attach toc entries when toc is not 'sidebar'", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n"),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r", toc: "inline" });
    expect(data.toc).toBeUndefined();
    expect(data.html).toContain("gitlab-md-toc");
  });

  it("rejects an invalid toc value", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n"),
    };
    await expect(fetchReadme(ctx(client), { project: "g/r", toc: "left" })).rejects.toThrow(
      /"toc" must be one of/,
    );
  });

  it("keys the cache by toc mode so different modes do not collide", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n"),
    };
    const c = ctx(client);
    const sidebar = await fetchReadme(c, { project: "g/r", toc: "sidebar" });
    const inline = await fetchReadme(c, { project: "g/r", toc: "inline" });
    expect(sidebar.toc).toBeDefined();
    expect(inline.toc).toBeUndefined();
    expect(inline.html).toContain("gitlab-md-toc");
    expect(client.getFileRaw).toHaveBeenCalledTimes(2);
  });
});

describe("fetchFile", () => {
  it("renders a .md path as sanitized html with localized images", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "# Title\n\n![logo](./logo.png)"),
    };
    const c = ctx(client);
    const data = await fetchFile(c, { project: "g/r", path: "docs/GUIDE.md" });
    expect(data.kind).toBe("markdown");
    const md = data as Extract<typeof data, { kind: "markdown" }>;
    expect(md.html).toContain("<h1>Title</h1>");
    expect(md.html).toContain('src="/gitlab-assets/');
    expect(md.ref).toBe("main");
    expect(md.path).toBe("docs/GUIDE.md");
    expect(client.getFileRaw).toHaveBeenCalledWith("g/r", "docs/GUIDE.md", "main");
    expect(c.assets.localize).toHaveBeenCalledWith("./logo.png", "main", "g/r");
  });

  it("renders a .mdx path as markdown too", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "# Hello"),
    };
    const data = await fetchFile(ctx(client), { project: "g/r", path: "docs/page.mdx" });
    expect(data.kind).toBe("markdown");
  });

  it("returns a code block for a .ts path, using raw content verbatim", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "export const x = 1;\n"),
    };
    const data = await fetchFile(ctx(client), { project: "g/r", path: "src/index.ts" });
    expect(data.kind).toBe("code");
    const code = data as Extract<typeof data, { kind: "code" }>;
    expect(code.language).toBe("ts");
    expect(code.code).toBe("export const x = 1;\n");
    expect(code.ref).toBe("main");
    expect(code.path).toBe("src/index.ts");
  });

  it("applies a 1-based inclusive line range to code files", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "line1\nline2\nline3\nline4\n"),
    };
    const data = await fetchFile(ctx(client), { project: "g/r", path: "script.py", lines: "2-3" });
    expect(data.kind).toBe("code");
    const code = data as Extract<typeof data, { kind: "code" }>;
    expect(code.language).toBe("python");
    expect(code.code).toBe("line2\nline3");
  });

  it("uses the explicit ref without calling getProject", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "content"),
    };
    const c = ctx(client);
    const data = await fetchFile(c, { project: "g/r", path: "a.txt", ref: "v2" });
    expect(data.ref).toBe("v2");
    expect(c.client.getProject).not.toHaveBeenCalled();
    expect(client.getFileRaw).toHaveBeenCalledWith("g/r", "a.txt", "v2");
  });

  it("supports a single line number selection", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "line1\nline2\nline3\n"),
    };
    const data = await fetchFile(ctx(client), { project: "g/r", path: "a.go", lines: "2" });
    expect(data.kind).toBe("code");
    const code = data as Extract<typeof data, { kind: "code" }>;
    expect(code.code).toBe("line2");
  });

  it("defaults unknown extensions to text", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "whatever"),
    };
    const data = await fetchFile(ctx(client), { project: "g/r", path: "Makefile.weird" });
    expect(data.kind).toBe("code");
    const code = data as Extract<typeof data, { kind: "code" }>;
    expect(code.language).toBe("weird");
  });
});

describe("fetchTopics", () => {
  const raw = [
    { name: "docs", title: "Docs", total_projects_count: 3 },
    { name: "api", title: "API", total_projects_count: 10 },
    { name: "internal-tool", title: "Internal Tool", total_projects_count: 1 },
  ];

  it("normalizes topics and builds the explore URL, sorted by title ascending", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), {});
    expect(data.map((t) => t.title)).toEqual(["API", "Docs", "Internal Tool"]);
    expect(data[0]).toEqual({
      name: "api",
      title: "API",
      totalProjectsCount: 10,
      webUrl: "https://gitlab.com/explore/projects/topics/api",
    });
  });

  it("sorts descending when order=name:desc", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), { order: "name:desc" });
    expect(data.map((t) => t.title)).toEqual(["Internal Tool", "Docs", "API"]);
  });

  it("filters by case-insensitive regex on the title", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), { filter: "^a" });
    expect(data.map((t) => t.title)).toEqual(["API"]);
  });

  it("applies the limit after filtering and sorting", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), { limit: 2 });
    expect(data.map((t) => t.title)).toEqual(["API", "Docs"]);
  });

  it("throws on an invalid order value", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    await expect(fetchTopics(ctx(client), { order: "count" })).rejects.toThrow(/order/);
  });

  it("throws on an invalid filter regex", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    await expect(fetchTopics(ctx(client), { filter: "(" })).rejects.toThrow(/filter/);
  });

  it("caps the fetch at 500 items (100 per page, 5 pages) by default", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    await fetchTopics(ctx(client), {});
    expect(client.getTopics).toHaveBeenCalledWith({ perPage: 100, maxPages: 5 });
  });

  it("fetches fewer pages when a small limit is set and there is no filter", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    await fetchTopics(ctx(client), { limit: 150 });
    expect(client.getTopics).toHaveBeenCalledWith({ perPage: 100, maxPages: 2 });
  });

  it("keeps the full 500-item cap when a filter is set even with a small limit", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    await fetchTopics(ctx(client), { limit: 5, filter: "a" });
    expect(client.getTopics).toHaveBeenCalledWith({ perPage: 100, maxPages: 5 });
  });
});

describe("fetchLabels", () => {
  const rawLabels = [
    { name: "bug", color: "#d9534f", text_color: "#ffffff", description: "Defect", archived: false },
    { name: "feature", color: "#5cb85c", text_color: "#1a1a1a", description: null, archived: false },
    { name: "old", color: "#cccccc", text_color: "#000000", description: "retired", archived: true },
  ];

  function labelClient() {
    return {
      getProjectLabels: vi.fn(async () => rawLabels),
      getGroupLabels: vi.fn(async () => rawLabels),
      getProject: vi.fn(async () => ({ web_url: "https://gitlab.com/group/repo" })),
      getGroup: vi.fn(async () => ({ web_url: "https://gitlab.com/groups/my-group" })),
    };
  }

  it("normalizes project labels, drops archived, and builds the issues link", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { project: "group/repo" });
    expect(data.map((l) => l.name)).toEqual(["bug", "feature"]);
    expect(data[0]).toEqual({
      name: "bug",
      color: "#d9534f",
      textColor: "#ffffff",
      description: "Defect",
      webUrl: "https://gitlab.com/group/repo/-/issues?label_name[]=bug",
    });
    expect(client.getProjectLabels).toHaveBeenCalledWith("group/repo", { perPage: 100, maxPages: 5 });
    expect(client.getGroupLabels).not.toHaveBeenCalled();
  });

  it("uses the group endpoints and group issues link for group scope", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { group: "my-group" });
    expect(client.getGroupLabels).toHaveBeenCalledWith("my-group", { perPage: 100, maxPages: 5 });
    expect(client.getProjectLabels).not.toHaveBeenCalled();
    expect(data[0].webUrl).toBe("https://gitlab.com/groups/my-group/-/issues?label_name[]=bug");
  });

  it("fetches fewer pages when a small limit is set and there is no filter", async () => {
    const client = labelClient();
    await fetchLabels(ctx(client), { project: "group/repo", limit: 10 });
    expect(client.getProjectLabels).toHaveBeenCalledWith("group/repo", { perPage: 100, maxPages: 1 });
  });

  it("keeps the full 500-item cap when a filter is set even with a small limit", async () => {
    const client = labelClient();
    await fetchLabels(ctx(client), { project: "group/repo", limit: 10, filter: "bug" });
    expect(client.getProjectLabels).toHaveBeenCalledWith("group/repo", { perPage: 100, maxPages: 5 });
  });

  it("filters by case-insensitive regex on the name", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { project: "group/repo", filter: "^feat" });
    expect(data.map((l) => l.name)).toEqual(["feature"]);
  });

  it("sorts descending and applies the limit", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { project: "group/repo", order: "name:desc", limit: 1 });
    expect(data.map((l) => l.name)).toEqual(["feature"]);
  });

  it("throws when neither project nor group is given", async () => {
    const client = labelClient();
    await expect(fetchLabels(ctx(client), {})).rejects.toThrow(/exactly one/);
  });

  it("throws when both project and group are given", async () => {
    const client = labelClient();
    await expect(
      fetchLabels(ctx(client), { project: "group/repo", group: "my-group" }),
    ).rejects.toThrow(/exactly one/);
  });

  it("throws on an invalid layout value", async () => {
    const client = labelClient();
    await expect(
      fetchLabels(ctx(client), { project: "group/repo", layout: "grid" }),
    ).rejects.toThrow(/layout/);
  });
});
