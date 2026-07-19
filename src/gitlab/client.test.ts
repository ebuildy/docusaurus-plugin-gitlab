import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const showMock = vi.fn();
const releasesAllMock = vi.fn();
const issuesAllMock = vi.fn();
const commitsAllMock = vi.fn();
const showRawMock = vi.fn();
const gitlabCtor = vi.fn();
const topicsAllMock = vi.fn();
const projectLabelsAllMock = vi.fn();
const groupLabelsAllMock = vi.fn();
const groupShowMock = vi.fn();
const contributorsAllMock = vi.fn();
const epicsAllMock = vi.fn();
const groupMilestonesAllMock = vi.fn();
const projectMilestonesAllMock = vi.fn();
const usersAllMock = vi.fn();
const usersShowMock = vi.fn();
const groupMembersAllMock = vi.fn();
const projectMembersAllMock = vi.fn();

vi.mock("@gitbeaker/rest", () => ({
  // Vitest 4 invokes the mock implementation as a real constructor under
  // `new`, so the implementation must be a constructable (non-arrow) function.
  Gitlab: vi.fn(function (opts: unknown) {
    gitlabCtor(opts);
    return {
      Projects: { show: showMock },
      ProjectReleases: { all: releasesAllMock },
      Issues: { all: issuesAllMock },
      Commits: { all: commitsAllMock },
      RepositoryFiles: { showRaw: showRawMock },
      Topics: { all: topicsAllMock },
      ProjectLabels: { all: projectLabelsAllMock },
      GroupLabels: { all: groupLabelsAllMock },
      Groups: { show: groupShowMock },
      Repositories: { allContributors: contributorsAllMock },
      Epics: { all: epicsAllMock },
      GroupMilestones: { all: groupMilestonesAllMock },
      ProjectMilestones: { all: projectMilestonesAllMock },
      Users: { all: usersAllMock, show: usersShowMock },
      GroupMembers: { all: groupMembersAllMock },
      ProjectMembers: { all: projectMembersAllMock },
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
  commitsAllMock.mockReset();
  showRawMock.mockReset();
  gitlabCtor.mockReset();
  topicsAllMock.mockReset();
  projectLabelsAllMock.mockReset();
  groupLabelsAllMock.mockReset();
  groupShowMock.mockReset();
  contributorsAllMock.mockReset();
  epicsAllMock.mockReset();
  groupMilestonesAllMock.mockReset();
  projectMilestonesAllMock.mockReset();
  usersAllMock.mockReset();
  usersShowMock.mockReset();
  groupMembersAllMock.mockReset();
  projectMembersAllMock.mockReset();
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

  it("getCommits fetches one page and slices to the limit", async () => {
    commitsAllMock.mockResolvedValue([
      { short_id: "a1", title: "one" },
      { short_id: "b2", title: "two" },
      { short_id: "c3", title: "three" },
    ]);
    const client = new GitLabClient({ host: "https://gitlab.com" });
    const commits = await client.getCommits("g/r", 2);
    expect(commitsAllMock).toHaveBeenCalledWith("g/r", { perPage: 2, maxPages: 1 });
    expect(commits).toHaveLength(2);
    expect(commits[0].short_id).toBe("a1");
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

  it("getTopics defaults to 100 per page capped at 5 pages (500 max)", async () => {
    topicsAllMock.mockResolvedValue([{ name: "docs", total_projects_count: 3 }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getTopics();
    expect(data).toEqual([{ name: "docs", total_projects_count: 3 }]);
    expect(topicsAllMock).toHaveBeenCalledWith({ perPage: 100, maxPages: 5 });
  });

  it("getTopics forwards caller pagination overrides", async () => {
    topicsAllMock.mockResolvedValue([]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    await c.getTopics({ perPage: 100, maxPages: 2 });
    expect(topicsAllMock).toHaveBeenCalledWith({ perPage: 100, maxPages: 2 });
  });

  it("getProjectLabels delegates to ProjectLabels.all with the default 500 cap", async () => {
    projectLabelsAllMock.mockResolvedValue([{ name: "bug" }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getProjectLabels("group/repo");
    expect(data).toEqual([{ name: "bug" }]);
    expect(projectLabelsAllMock).toHaveBeenCalledWith("group/repo", { perPage: 100, maxPages: 5 });
  });

  it("getGroupLabels delegates to GroupLabels.all with the default 500 cap", async () => {
    groupLabelsAllMock.mockResolvedValue([{ name: "epic" }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getGroupLabels("my-group");
    expect(data).toEqual([{ name: "epic" }]);
    expect(groupLabelsAllMock).toHaveBeenCalledWith("my-group", { perPage: 100, maxPages: 5 });
  });

  it("getGroup delegates to Groups.show", async () => {
    groupShowMock.mockResolvedValue({ id: 9, web_url: "https://x/groups/my-group" });
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getGroup("my-group");
    expect(data).toEqual({ id: 9, web_url: "https://x/groups/my-group" });
    expect(groupShowMock).toHaveBeenCalledWith("my-group");
  });

  it("getProject forwards the statistics option", async () => {
    showMock.mockResolvedValue({ id: 1 });
    const client = new GitLabClient({ host: "https://gitlab.com" });
    await client.getProject("g/r", { statistics: true });
    expect(showMock).toHaveBeenCalledWith("g/r", { statistics: true });
  });

  it("getProject omits options by default", async () => {
    showMock.mockResolvedValue({ id: 1 });
    const client = new GitLabClient({ host: "https://gitlab.com" });
    await client.getProject("g/r");
    expect(showMock).toHaveBeenCalledWith("g/r");
  });

  it("getContributorsCount returns the pagination total", async () => {
    contributorsAllMock.mockResolvedValue({ data: [{}], paginationInfo: { total: 8 } });
    const client = new GitLabClient({ host: "https://gitlab.com" });
    const count = await client.getContributorsCount("g/r");
    expect(contributorsAllMock).toHaveBeenCalledWith("g/r", { showExpanded: true, perPage: 1, maxPages: 1 });
    expect(count).toBe(8);
  });

  it("getContributorsCount returns undefined when total is absent", async () => {
    contributorsAllMock.mockResolvedValue({ data: [], paginationInfo: {} });
    const client = new GitLabClient({ host: "https://gitlab.com" });
    expect(await client.getContributorsCount("g/r")).toBeUndefined();
  });

  it("getContributorsCount returns undefined when total is NaN", async () => {
    contributorsAllMock.mockResolvedValue({ data: [], paginationInfo: { total: NaN } });
    const client = new GitLabClient({ host: "https://gitlab.com" });
    expect(await client.getContributorsCount("g/r")).toBeUndefined();
  });
});

describe("getGroupProjects", () => {
  it("requests group projects with subgroup recursion and archived filter", async () => {
    const client = new GitLabClient({ host: "https://gitlab.com" });
    const allProjects = vi.fn(async () => [{ id: 1, path: "a" }]);
    (client as any).api = { Groups: { allProjects } };

    const res = await client.getGroupProjects(1, { includeSubgroups: true, archived: false });

    expect(res).toEqual([{ id: 1, path: "a" }]);
    expect(allProjects).toHaveBeenCalledWith(1, {
      includeSubgroups: true,
      archived: false,
      perPage: 100,
      maxPages: 5,
      orderBy: "path",
      sort: "asc",
    });
  });

  it("omits archived filter when includeArchived is requested (archived undefined)", async () => {
    const client = new GitLabClient({ host: "https://gitlab.com" });
    const allProjects = vi.fn(async () => []);
    (client as any).api = { Groups: { allProjects } };

    await client.getGroupProjects("grp", { includeSubgroups: false });

    expect(allProjects).toHaveBeenCalledWith("grp", {
      includeSubgroups: false,
      perPage: 100,
      maxPages: 5,
      orderBy: "path",
      sort: "asc",
    });
  });
});

describe("roadmap sources", () => {
  it("getGroupEpics passes filters and bounded pagination", async () => {
    epicsAllMock.mockResolvedValue([{ id: 1 }]);
    const client = new GitLabClient({ host: "https://gitlab.com", token: "t" });
    const res = await client.getGroupEpics("g", { state: "opened", labels: "a", orderBy: "start_date", sort: "asc" });
    expect(res).toEqual([{ id: 1 }]);
    expect(epicsAllMock).toHaveBeenCalledWith("g", {
      state: "opened", labels: "a", orderBy: "start_date", sort: "asc", perPage: 100, maxPages: 5,
    });
  });

  it("getGroupMilestones and getProjectMilestones fetch with bounded pagination", async () => {
    groupMilestonesAllMock.mockResolvedValue([{ id: 2 }]);
    projectMilestonesAllMock.mockResolvedValue([{ id: 3 }]);
    const client = new GitLabClient({ host: "https://gitlab.com", token: "t" });
    expect(await client.getGroupMilestones("g")).toEqual([{ id: 2 }]);
    expect(await client.getProjectMilestones("p/x")).toEqual([{ id: 3 }]);
    expect(groupMilestonesAllMock).toHaveBeenCalledWith("g", { perPage: 100, maxPages: 5 });
    expect(projectMilestonesAllMock).toHaveBeenCalledWith("p/x", { perPage: 100, maxPages: 5 });
  });
});

describe("users and members", () => {
  it("getUserByUsername queries the users endpoint with an exact username", async () => {
    usersAllMock.mockResolvedValue([{ id: 101, username: "jdoe" }]);
    const c = new GitLabClient({ host: "https://gitlab.example.com" });
    await expect(c.getUserByUsername("jdoe")).resolves.toEqual([{ id: 101, username: "jdoe" }]);
    expect(usersAllMock).toHaveBeenCalledWith({ username: "jdoe", maxPages: 1 });
  });

  it("getUser fetches the full single-user profile", async () => {
    usersShowMock.mockResolvedValue({ id: 101, bio: "hi" });
    const c = new GitLabClient({ host: "https://gitlab.example.com" });
    await expect(c.getUser(101)).resolves.toEqual({ id: 101, bio: "hi" });
    expect(usersShowMock).toHaveBeenCalledWith(101);
  });

  it("member fetches include inherited members with the 500-item ceiling", async () => {
    groupMembersAllMock.mockResolvedValue([]);
    projectMembersAllMock.mockResolvedValue([]);
    const c = new GitLabClient({ host: "https://gitlab.example.com" });
    await c.getGroupMembers("my-group");
    expect(groupMembersAllMock).toHaveBeenCalledWith("my-group", {
      includeInherited: true,
      perPage: 100,
      maxPages: 5,
    });
    await c.getProjectMembers("group/repo");
    expect(projectMembersAllMock).toHaveBeenCalledWith("group/repo", {
      includeInherited: true,
      perPage: 100,
      maxPages: 5,
    });
  });
});
