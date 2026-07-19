import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import rehypeRaw from "rehype-raw";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { describe, it, expect, vi } from "vitest";
import { FileCache } from "./cache";
import { fetchProjectInfo, fetchReleases, fetchIssues, fetchCommits, fetchReadme, fetchFile, fetchTopics, fetchLabels, fetchGroupProjects, fetchRoadmap, fetchUser, fetchUsers } from "./fetchers";

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
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(data).toMatchObject({ id: 7, path: "g/r", starCount: 3, topics: ["x"] });
    expect(data.descriptionHtml).toContain("<strong>it</strong>");
    expect(data.descriptionHtml).toContain("🚀");
    expect(data.avatarUrl).toBeNull();
    expect(c.assets.localize).not.toHaveBeenCalled();
    expect(client.getProject).toHaveBeenCalledWith("g/r", { statistics: true });
  });

  it("maps statistics, open issues, and contributors count", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], created_at: "2020-05-01T00:00:00Z",
        last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
        issues_enabled: true, open_issues_count: 12,
        statistics: { commit_count: 1200, repository_size: 4404019 },
      })),
      getContributorsCount: vi.fn(async () => 8),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(client.getProject).toHaveBeenCalledWith("g/r", { statistics: true });
    expect(data.createdAt).toBe("2020-05-01T00:00:00Z");
    expect(data.commitCount).toBe(1200);
    expect(data.repositorySize).toBe(4404019);
    expect(data.openIssuesCount).toBe(12);
    expect(data.contributorsCount).toBe(8);
  });

  it("omits statistics-derived stats when statistics is absent", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
        issues_enabled: false,
      })),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(data.commitCount).toBeUndefined();
    expect(data.repositorySize).toBeUndefined();
    expect(data.openIssuesCount).toBeUndefined();
    expect(data.contributorsCount).toBeUndefined();
  });

  it("never throws when the contributors fetch fails, even in strict mode", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
        issues_enabled: true, open_issues_count: 5, statistics: { commit_count: 1, repository_size: 1 },
      })),
      getContributorsCount: vi.fn(async () => { throw new Error("no perms"); }),
    };
    const c = ctx(client);
    c.options.strict = true;
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(data.contributorsCount).toBeUndefined();
    expect(data.commitCount).toBe(1);
  });

  it("localizes the avatar when the project has one", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: ["x"], last_activity_at: "2026-01-01T00:00:00Z",
        avatar_url: "https://gitlab.com/uploads/avatar.png",
      })),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(c.assets.localize).toHaveBeenCalledWith("https://gitlab.com/uploads/avatar.png", "", "g/r");
    expect(data.avatarUrl).toBe("/gitlab-assets/httpsgitlabcomuploadsavatarpng.png");
  });

  it("attaches sections only when their count is > 0", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      })),
      getReleases: vi.fn(async () => [
        { name: "v1", tag_name: "v1", released_at: "2026-01-01T00:00:00Z", description: "", upcoming_release: false, assets: { links: [] } },
      ]),
      getCommits: vi.fn(async () => [
        { short_id: "a1", title: "t", web_url: "u", author_name: "Ada", created_at: "2026-01-02T00:00:00Z" },
      ]),
      getIssues: vi.fn(async () => []),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r", releases: 2, commits: 3 });
    expect(client.getReleases).toHaveBeenCalledWith("g/r", 2);
    expect(client.getCommits).toHaveBeenCalledWith("g/r", 3);
    expect(client.getIssues).not.toHaveBeenCalled();
    expect(data.releases).toHaveLength(1);
    expect(data.commits).toHaveLength(1);
    expect(data.issues).toBeUndefined();
  });

  it("does not fetch a section when its count is 0 or absent", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      })),
      getReleases: vi.fn(async () => []),
      getCommits: vi.fn(async () => []),
      getIssues: vi.fn(async () => []),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r", commits: 0 });
    expect(client.getReleases).not.toHaveBeenCalled();
    expect(client.getCommits).not.toHaveBeenCalled();
    expect(client.getIssues).not.toHaveBeenCalled();
    expect(data.releases).toBeUndefined();
  });

  it("omits a failing section in non-strict mode instead of throwing", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      })),
      getReleases: vi.fn(async () => { throw new Error("boom"); }),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    c.options.strict = false;
    const data = await fetchProjectInfo(c, { project: "g/r", releases: 2 });
    expect(data.releases).toBeUndefined();
    expect(data.name).toBe("r");
  });

  it("rethrows a failing section in strict mode", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      })),
      getReleases: vi.fn(async () => { throw new Error("boom"); }),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    c.options.strict = true;
    await expect(fetchProjectInfo(c, { project: "g/r", releases: 2 })).rejects.toThrow("boom");
  });

  it("rejects an invalid section layout", async () => {
    const client = { getProject: vi.fn(async () => ({ id: 1, path_with_namespace: "g/r", name: "r", description: "", web_url: "u", star_count: 0, forks_count: 0, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null })) };
    await expect(fetchProjectInfo(ctx(client), { project: "g/r", releasesLayout: "grid" })).rejects.toThrow(/releasesLayout/);
  });

  it("caches sections separately per count (cache key varies)", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      })),
      getReleases: vi.fn(async (_p: unknown, limit: number) =>
        Array.from({ length: limit }, (_, i) => ({
          name: `v${i}`, tag_name: `v${i}`, released_at: "2026-01-01T00:00:00Z",
          description: "", upcoming_release: false, assets: { links: [] },
        })),
      ),
      getCommits: vi.fn(async () => []),
      getIssues: vi.fn(async () => []),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const c = ctx(client);
    const first = await fetchProjectInfo(c, { project: "g/r", releases: 1 });
    const second = await fetchProjectInfo(c, { project: "g/r", releases: 2 });
    expect(first.releases).toHaveLength(1);
    expect(second.releases).toHaveLength(2);
    expect(client.getReleases).toHaveBeenCalledTimes(2);
  });
});

describe("fetchReleases", () => {
  it("normalizes releases, renders notes, and respects limit", async () => {
    const client = {
      getReleases: vi.fn(async () => [
        { name: "v1", tag_name: "v1", released_at: "2026-01-01T00:00:00Z", description: "**notes**",
          upcoming_release: false, assets: { links: [{ name: "bin", url: "https://x/bin" }] },
          _links: { self: "https://gitlab.com/g/r/-/releases/v1" } },
      ]),
    };
    const data = await fetchReleases(ctx(client), { project: "g/r", limit: 5, includePrereleases: true });
    expect(data).toHaveLength(1);
    expect(data[0].tagName).toBe("v1");
    expect(data[0].webUrl).toBe("https://gitlab.com/g/r/-/releases/v1");
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

describe("fetchCommits", () => {
  it("normalizes commits and respects the limit", async () => {
    const client = {
      getCommits: vi.fn(async () => [
        { short_id: "a1b2c3d", title: "fix: thing", web_url: "https://gitlab.com/g/r/-/commit/a1b2c3d",
          author_name: "Ada", created_at: "2026-01-02T00:00:00Z" },
      ]),
    };
    const c = ctx(client);
    const data = await fetchCommits(c, { project: "g/r", limit: 5 });
    expect(client.getCommits).toHaveBeenCalledWith("g/r", 5);
    expect(data).toEqual([
      { shortId: "a1b2c3d", title: "fix: thing", webUrl: "https://gitlab.com/g/r/-/commit/a1b2c3d",
        authorName: "Ada", createdAt: "2026-01-02T00:00:00Z" },
    ]);
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

describe("fetchGroupProjects", () => {
  const project = (over: any) => ({
    id: 1, name: "Acme Web", path: "acme-web",
    path_with_namespace: "mygroup/acme-web", description: "web app",
    web_url: "https://gitlab.com/mygroup/acme-web", star_count: 4,
    default_branch: "main", topics: ["public-docs"], ...over,
  });

  function client(projects: any[]) {
    return {
      getGroup: vi.fn(async () => ({ full_path: "mygroup" })),
      getGroupProjects: vi.fn(async () => projects),
    };
  }

  it("normalizes projects and derives slug from the group prefix", async () => {
    const c = ctx(client([
      project({}),
      project({ id: 2, name: "Mobile", path: "acme-mobile", path_with_namespace: "mygroup/team-x/acme-mobile" }),
    ]));
    const data = await fetchGroupProjects(c, { group: "mygroup", includeSubgroups: true });
    expect(data.map((p) => p.slug)).toEqual(["acme-web", "team-x/acme-mobile"]);
    expect(data[0]).toMatchObject({ id: 1, name: "Acme Web", pathWithNamespace: "mygroup/acme-web", starCount: 4, description: "web app" });
  });

  it("filters to projects carrying all requested topics", async () => {
    const c = ctx(client([
      project({ topics: ["public-docs", "featured"] }),
      project({ id: 2, path: "hidden", path_with_namespace: "mygroup/hidden", topics: ["public-docs"] }),
    ]));
    const data = await fetchGroupProjects(c, { group: "mygroup", topics: "public-docs,featured" });
    expect(data.map((p) => p.path)).toEqual(["acme-web"]);
  });

  it("excludes archived by default (passes archived:false to the client)", async () => {
    const c = ctx(client([project({})]));
    await fetchGroupProjects(c, { group: "mygroup" });
    expect(c.client.getGroupProjects).toHaveBeenCalledWith("mygroup", { includeSubgroups: false, archived: false });
  });

  it("includes archived when includeArchived is true (archived undefined)", async () => {
    const c = ctx(client([project({})]));
    await fetchGroupProjects(c, { group: "mygroup", includeArchived: true });
    expect(c.client.getGroupProjects).toHaveBeenCalledWith("mygroup", { includeSubgroups: false, archived: undefined });
  });

  it("memoizes on the second call", async () => {
    const c = ctx(client([project({})]));
    await fetchGroupProjects(c, { group: "mygroup" });
    await fetchGroupProjects(c, { group: "mygroup" });
    expect(c.client.getGroupProjects).toHaveBeenCalledTimes(1);
  });
});

describe("fetchRoadmap (epics)", () => {
  const epics = [
    { id: 10, iid: 1, title: "Auth", state: "opened", start_date: "2026-01-01", due_date: "2026-03-01",
      web_url: "https://gitlab.com/groups/g/-/epics/1", color: "#1f75cb", parent_id: null, labels: ["backend"] },
    { id: 11, iid: 2, title: "Billing", state: "closed", start_date: "2026-02-01", due_date: "2026-05-01",
      web_url: "https://gitlab.com/groups/g/-/epics/2", color: "#6666c4", parent_id: 10, labels: [] },
  ];

  it("normalizes epics into positioned RoadmapData", async () => {
    const client = {
      getGroupEpics: vi.fn(async () => epics),
      getGroupLabels: vi.fn(async () => [{ name: "backend", color: "#dbeafe", text_color: "#1e40af" }]),
    };
    const c = ctx(client);
    const data = await fetchRoadmap(c, { source: "epics", group: "g" });
    expect(data.source).toBe("epics");
    const items = data.groups.flatMap((g) => g.items);
    expect(items.map((i) => i.title).sort()).toEqual(["Auth", "Billing"]);
    const auth = items.find((i) => i.title === "Auth")!;
    expect(auth.startDate).toBe("2026-01-01");
    expect(auth.color).toBe("#1f75cb");
    expect(auth.labels).toEqual([{ name: "backend", color: "#dbeafe", textColor: "#1e40af" }]);
    expect(auth.widthPct).toBeGreaterThan(0);
    expect(client.getGroupEpics).toHaveBeenCalled();
  });

  it("sends only an Epics-API-valid order_by (never start_date/due_date)", async () => {
    // The GitLab Epics API rejects order_by=start_date|due_date; start/due ordering
    // is done client-side. Guard against re-introducing an invalid API value.
    const valid = new Set(["created_at", "updated_at", "title"]);
    for (const order of ["start", "due", "title"] as const) {
      const client = { getGroupEpics: vi.fn(async () => epics), getGroupLabels: vi.fn(async () => []) };
      const c = ctx(client);
      await fetchRoadmap(c, { source: "epics", group: "g", order });
      const passedOrderBy = (client.getGroupEpics.mock.calls[0] as any)[1].orderBy;
      expect(valid.has(passedOrderBy)).toBe(true);
    }
  });

  it("throws when source is epics but group is missing", async () => {
    const c = ctx({});
    await expect(fetchRoadmap(c, { source: "epics" })).rejects.toThrow(/group/);
  });

  it("degrades: rethrows in strict mode", async () => {
    const client = { getGroupEpics: vi.fn(async () => { throw new Error("403 tier"); }) };
    const c = ctx(client);
    c.options.strict = true;
    await expect(fetchRoadmap(c, { source: "epics", group: "g" })).rejects.toThrow("403 tier");
  });

  it("rejects a non-ISO from/to date", async () => {
    const client = { getGroupEpics: vi.fn(async () => []), getGroupLabels: vi.fn(async () => []) };
    const c = ctx(client);
    await expect(fetchRoadmap(c, { source: "epics", group: "g", from: "last week" })).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe("fetchRoadmap (milestones)", () => {
  const milestones = [
    { id: 1, iid: 5, title: "v1.0", state: "active", start_date: "2026-01-01", due_date: "2026-02-01",
      web_url: "https://gitlab.com/g/r/-/milestones/5" },
    { id: 2, iid: 6, title: "v1.1", state: "closed", start_date: "2026-02-01", due_date: "2026-03-01",
      web_url: "https://gitlab.com/g/r/-/milestones/6" },
  ];

  it("normalizes project milestones and maps active→opened (state=all shows both)", async () => {
    const client = {
      getProjectMilestones: vi.fn(async () => milestones),
      getProjectLabels: vi.fn(async () => []),
    };
    const c = ctx(client);
    const data = await fetchRoadmap(c, { source: "milestones", project: "g/r", state: "all" });
    expect(data.source).toBe("milestones");
    const items = data.groups.flatMap((g) => g.items);
    expect(items.find((i) => i.title === "v1.0")!.state).toBe("opened");
    expect(items.find((i) => i.title === "v1.1")!.state).toBe("closed");
    expect(items.every((i) => i.color === undefined)).toBe(true);
    expect(client.getProjectMilestones).toHaveBeenCalledWith("g/r");
  });

  it("fetches group milestones when group is given", async () => {
    const client = { getGroupMilestones: vi.fn(async () => milestones), getGroupLabels: vi.fn(async () => []) };
    const c = ctx(client);
    const data = await fetchRoadmap(c, { source: "milestones", group: "g", state: "all" });
    expect(data.groups.flatMap((g) => g.items)).toHaveLength(2);
    expect(client.getGroupMilestones).toHaveBeenCalledWith("g");
  });

  it("filters to active milestones by default (state defaults to opened)", async () => {
    const client = { getProjectMilestones: vi.fn(async () => milestones), getProjectLabels: vi.fn(async () => []) };
    const c = ctx(client);
    const data = await fetchRoadmap(c, { source: "milestones", project: "g/r" });
    const items = data.groups.flatMap((g) => g.items);
    expect(items.map((i) => i.title)).toEqual(["v1.0"]);
  });
});

describe("fetchUser", () => {
  const profile = {
    id: 101, username: "jdoe", name: "Jane Doe", web_url: "https://x/jdoe", avatar_url: "https://x/a.png",
    job_title: "Senior Developer", organization: "ACME", location: "Paris", bio: "Docs enthusiast",
    followers: 12, following: 34, created_at: "2020-01-15T00:00:00Z",
  };

  it("resolves the username and normalizes the full profile", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 101, username: "jdoe" }]),
      getUser: vi.fn(async () => profile),
    };
    const c = ctx(client);
    const data = await fetchUser(c, { name: "jdoe" });
    expect(client.getUserByUsername).toHaveBeenCalledWith("jdoe");
    expect(client.getUser).toHaveBeenCalledWith(101);
    expect(data).toMatchObject({
      id: 101, username: "jdoe", name: "Jane Doe", webUrl: "https://x/jdoe",
      jobTitle: "Senior Developer", organization: "ACME", location: "Paris",
      bio: "Docs enthusiast", followers: 12, following: 34, createdAt: "2020-01-15T00:00:00Z",
    });
    expect(c.assets.localize).toHaveBeenCalledWith("https://x/a.png", "", "user/jdoe");
    expect(data.avatarUrl).toMatch(/^\/gitlab-assets\//);
  });

  it("throws a clear error when the username does not exist", async () => {
    const client = { getUserByUsername: vi.fn(async () => []), getUser: vi.fn() };
    await expect(fetchUser(ctx(client), { name: "nope" })).rejects.toThrow(/user "nope" not found/);
    expect(client.getUser).not.toHaveBeenCalled();
  });

  it("requires a name and rejects invalid show tokens", async () => {
    await expect(fetchUser(ctx({}), {})).rejects.toThrow(/requires a "name"/);
    await expect(fetchUser(ctx({}), { name: "jdoe", show: "role" })).rejects.toThrow(/does not support "role"/);
  });

  it("nulls absent profile fields and skips avatar localization when absent", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 7, username: "bob" }]),
      getUser: vi.fn(async () => ({ id: 7, username: "bob", name: "Bob", web_url: "https://x/bob", avatar_url: null })),
    };
    const c = ctx(client);
    const data = await fetchUser(c, { name: "bob" });
    expect(data).toMatchObject({
      jobTitle: null, organization: null, location: null, bio: null,
      followers: null, following: null, createdAt: null,
    });
    expect(data.avatarUrl).toBeNull();
    expect(c.assets.localize).not.toHaveBeenCalled();
  });

  it("resolves the username case-insensitively", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 5, username: "tdecaux" }]),
      getUser: vi.fn(async () => ({ id: 5, username: "tdecaux", name: "T Decaux", web_url: "https://x/tdecaux" })),
    };
    const c = ctx(client);
    await expect(fetchUser(c, { name: "TDecaux" })).resolves.toMatchObject({ id: 5, username: "tdecaux" });
    expect(client.getUser).toHaveBeenCalledWith(5);
  });

  it("memoizes so a repeated lookup hits the network once", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 101, username: "jdoe" }]),
      getUser: vi.fn(async () => profile),
    };
    const c = ctx(client);
    await fetchUser(c, { name: "jdoe" });
    await fetchUser(c, { name: "jdoe" });
    expect(client.getUserByUsername).toHaveBeenCalledTimes(1);
    expect(client.getUser).toHaveBeenCalledTimes(1);
  });

  it("falls back to the username when the profile has no name", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 9, username: "noname" }]),
      getUser: vi.fn(async () => ({ id: 9, username: "noname", name: null, web_url: "https://x/noname" })),
    };
    const data = await fetchUser(ctx(client), { name: "noname" });
    expect(data.name).toBe("noname");
  });

  it("trims the name attribute before resolving", async () => {
    const client = {
      getUserByUsername: vi.fn(async () => [{ id: 101, username: "jdoe" }]),
      getUser: vi.fn(async () => profile),
    };
    await fetchUser(ctx(client), { name: "  jdoe  " });
    expect(client.getUserByUsername).toHaveBeenCalledWith("jdoe");
  });
});

describe("fetchUsers", () => {
  // Unsorted + one duplicate (a user can be direct AND inherited member).
  const members = [
    { id: 1, username: "jdoe", name: "Jane Doe", web_url: "https://x/jdoe", avatar_url: null, access_level: 50 },
    { id: 2, username: "bob", name: "Bob Martin", web_url: "https://x/bob", avatar_url: null, access_level: 30 },
    { id: 2, username: "bob", name: "Bob Martin", web_url: "https://x/bob", avatar_url: null, access_level: 30 },
  ];

  function membersClient() {
    return {
      getGroupMembers: vi.fn(async () => members),
      getProjectMembers: vi.fn(async () => members),
      getUserByUsername: vi.fn(async (u: string) => [{ id: u === "jdoe" ? 1 : 2, username: u }]),
      getUser: vi.fn(async (id: number) => ({
        id,
        username: id === 1 ? "jdoe" : "bob",
        name: id === 1 ? "Jane Doe" : "Bob Martin",
        web_url: "https://x/u",
        avatar_url: null,
        bio: "hi",
        followers: 1,
        following: 2,
      })),
    };
  }

  it("requires exactly one of project/group", async () => {
    await expect(fetchUsers(ctx({}), {})).rejects.toThrow(/exactly one of "project" or "group"/);
    await expect(fetchUsers(ctx({}), { project: "g/r", group: "g" })).rejects.toThrow(/exactly one/);
  });

  it("lists members with role names, deduped and sorted by display name", async () => {
    const client = membersClient();
    const data = await fetchUsers(ctx(client), { group: "my-group" });
    expect(client.getGroupMembers).toHaveBeenCalledWith("my-group");
    expect(data.map((u) => u.username)).toEqual(["bob", "jdoe"]);
    expect(data.map((u) => u.role)).toEqual(["developer", "owner"]);
    // default show="role" is identity-only → zero per-user profile calls
    expect(client.getUserByUsername).not.toHaveBeenCalled();
    expect(client.getUser).not.toHaveBeenCalled();
    expect(data[0]).toMatchObject({ bio: null, followers: null, createdAt: null });
  });

  it("filters by role (exact, case-insensitive) and applies limit", async () => {
    const devs = await fetchUsers(ctx(membersClient()), { group: "my-group", role: "Developer" });
    expect(devs.map((u) => u.username)).toEqual(["bob"]);
    const limited = await fetchUsers(ctx(membersClient()), { group: "my-group", limit: 1 });
    expect(limited.map((u) => u.username)).toEqual(["bob"]);
  });

  it("rejects an unknown role and a non-positive limit", async () => {
    await expect(fetchUsers(ctx({}), { group: "g", role: "boss" })).rejects.toThrow(/"role" must be one of/);
    await expect(fetchUsers(ctx({}), { group: "g", limit: 0 })).rejects.toThrow(/"limit" must be a positive integer/);
  });

  it("rejects a fractional limit", async () => {
    await expect(fetchUsers(ctx({}), { group: "g", limit: 1.5 })).rejects.toThrow(/"limit" must be a positive integer/);
  });

  it("enriches each member exactly once when show needs profile fields", async () => {
    const client = membersClient();
    const data = await fetchUsers(ctx(client), { project: "g/r", show: "role,bio,counts" });
    expect(client.getProjectMembers).toHaveBeenCalledWith("g/r");
    expect(client.getUser).toHaveBeenCalledTimes(2);
    expect(data.map((u) => u.bio)).toEqual(["hi", "hi"]);
    // role comes from the members payload, not the profile
    expect(data.map((u) => u.role)).toEqual(["developer", "owner"]);
  });

  it("dedupes to the highest access level when a member appears at multiple levels", async () => {
    const client = {
      getGroupMembers: vi.fn(async () => [
        // Inherited (lower) row first, direct (higher) row second — effective
        // membership is the max, regardless of row order.
        { id: 2, username: "bob", name: "Bob Martin", web_url: "https://x/bob", avatar_url: null, access_level: 30 },
        { id: 2, username: "bob", name: "Bob Martin", web_url: "https://x/bob", avatar_url: null, access_level: 50 },
      ]),
    };
    const data = await fetchUsers(ctx(client), { group: "my-group" });
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ username: "bob", role: "owner" });
  });

  it("degrades to identity data when one member's profile cannot be resolved, without failing the roster", async () => {
    const client = {
      getGroupMembers: vi.fn(async () => members),
      // "bob" is a bot/service account that doesn't resolve; "jdoe" does.
      getUserByUsername: vi.fn(async (u: string) => (u === "bob" ? [] : [{ id: 1, username: "jdoe" }])),
      getUser: vi.fn(async (id: number) => ({
        id,
        username: "jdoe",
        name: "Jane Doe",
        web_url: "https://x/jdoe",
        avatar_url: null,
        bio: "hi",
        followers: 1,
        following: 2,
      })),
    };
    const data = await fetchUsers(ctx(client), { group: "my-group", show: "role,bio" });
    expect(data.map((u) => u.username)).toEqual(["bob", "jdoe"]);
    expect(data[0]).toMatchObject({ username: "bob", role: "developer", bio: null, followers: null, createdAt: null });
    expect(data[1]).toMatchObject({ username: "jdoe", role: "owner", bio: "hi" });
  });

  it("applies limit before enrichment so only surviving members are resolved", async () => {
    const client = membersClient();
    const data = await fetchUsers(ctx(client), { group: "my-group", show: "role,bio", limit: 1 });
    expect(data.map((u) => u.username)).toEqual(["bob"]);
    expect(client.getUser).toHaveBeenCalledTimes(1);
  });
});
