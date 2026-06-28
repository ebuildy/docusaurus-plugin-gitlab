import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const showMock = vi.fn();
const releasesAllMock = vi.fn();
const issuesAllMock = vi.fn();
const showRawMock = vi.fn();
const gitlabCtor = vi.fn();

vi.mock("@gitbeaker/rest", () => ({
  Gitlab: vi.fn().mockImplementation((opts: unknown) => {
    gitlabCtor(opts);
    return {
      Projects: { show: showMock },
      ProjectReleases: { all: releasesAllMock },
      Issues: { all: issuesAllMock },
      RepositoryFiles: { showRaw: showRawMock },
    };
  }),
}));

const { GitLabClient } = await import("./client");

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  showMock.mockReset();
  releasesAllMock.mockReset();
  issuesAllMock.mockReset();
  showRawMock.mockReset();
  gitlabCtor.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitLabClient", () => {
  it("constructs gitbeaker with host+token when a token is set", () => {
    new GitLabClient({ host: "https://gitlab.com", token: "secret" });
    expect(gitlabCtor).toHaveBeenCalledWith({ host: "https://gitlab.com", token: "secret" });
  });

  it("constructs gitbeaker with host only when no token is set", () => {
    new GitLabClient({ host: "https://gitlab.com" });
    expect(gitlabCtor).toHaveBeenCalledWith({ host: "https://gitlab.com" });
  });

  it("getProject delegates to Projects.show", async () => {
    showMock.mockResolvedValue({ id: 1 });
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getProject("group/sub/repo");
    expect(data).toEqual({ id: 1 });
    expect(showMock).toHaveBeenCalledWith("group/sub/repo");
  });

  it("getReleases delegates to ProjectReleases.all capped to one page and slices to the limit", async () => {
    releasesAllMock.mockResolvedValue([{ name: "v1" }, { name: "v2" }, { name: "v3" }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getReleases("group/repo", 2);
    expect(releasesAllMock).toHaveBeenCalledWith("group/repo", { perPage: 2, maxPages: 1 });
    expect(data).toEqual([{ name: "v1" }, { name: "v2" }]);
  });

  it("getIssues delegates to Issues.all with projectId and filters, capped to one page", async () => {
    issuesAllMock.mockResolvedValue([{ iid: 1 }, { iid: 2 }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getIssues("group/repo", { state: "opened", labels: "bug", limit: 2 });
    expect(issuesAllMock).toHaveBeenCalledWith({
      projectId: "group/repo",
      state: "opened",
      labels: "bug",
      milestone: undefined,
      perPage: 2,
      maxPages: 1,
    });
    expect(data).toEqual([{ iid: 1 }, { iid: 2 }]);
  });

  it("getFileRaw delegates to RepositoryFiles.showRaw with the given path and ref", async () => {
    showRawMock.mockResolvedValue("# hello");
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getFileRaw("group/repo", "README.md", "main");
    expect(showRawMock).toHaveBeenCalledWith("group/repo", "README.md", "main");
    expect(data).toBe("# hello");
  });

  it("getFileRaw converts a Blob response to text", async () => {
    showRawMock.mockResolvedValue(new Blob(["# blob readme"]));
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getFileRaw("group/repo", "README.md", "main");
    expect(data).toBe("# blob readme");
  });

  it("requestBinary sends the PRIVATE-TOKEN header when a token is set", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const c = new GitLabClient({ host: "https://gitlab.com", token: "secret" });
    const res = await c.requestBinary("https://gitlab.com/x.png");
    expect(res.contentType).toBe("image/png");
    expect(new Uint8Array(res.body)).toEqual(bytes);
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBe("secret");
  });

  it("requestBinary omits the PRIVATE-TOKEN header when no token is set", async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    const c = new GitLabClient({ host: "https://gitlab.com" });
    await c.requestBinary("https://gitlab.com/x.png");
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBeUndefined();
  });

  it("requestBinary throws a descriptive error on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    const c = new GitLabClient({ host: "https://gitlab.com" });
    await expect(c.requestBinary("https://gitlab.com/x.png")).rejects.toThrow(/404/);
  });
});
