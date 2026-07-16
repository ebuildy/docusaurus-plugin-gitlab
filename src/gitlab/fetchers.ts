// `expandIncludes` lives in the include subsystem, which imports `fetchFileSource`
// from this module — a benign call-time-only cycle (both are hoisted function
// declarations, used only at runtime, never at module-eval time).
import type { PluggableList } from "unified";
import { expandIncludes } from "../include/expand.js";
import { createIncludeLogger } from "../include/logger.js";
import type { AssetManager } from "./assets";
import type { FileCache } from "./cache";
import type { GitLabClient, PageOptions } from "./client";
import { renderMarkdown } from "./markdown.js";
import { buildRoadmap, type BuildRoadmapOptions } from "./roadmap.js";
import type { TocEntry, TocMode } from "./toc.js";
import type {
  CommitData,
  FileData,
  GroupProjectData,
  IssueData,
  LabelData,
  LabelRef,
  ProjectInfoData,
  ReadmeData,
  ReleaseData,
  RoadmapData,
  RoadmapItemData,
  RoadmapScale,
  TopicData,
  UserData,
} from "./types";
import { needsProfile, parseRole, parseShow, roleName } from "./users.js";

export interface GitLabContext {
  client: GitLabClient;
  cache: FileCache;
  assets: AssetManager;
  options: {
    host: string;
    /** Include-pipeline settings (populated by `buildContext`); optional so test
     *  fakes can omit them. Defaults applied where read. */
    strict?: boolean;
    allowedHosts?: string[];
    debug?: boolean;
    markdownRenderChain?: PluggableList;
  };
}

/**
 * Expand GitLab `::include{file=…}` directives in fetched markdown before it is
 * rendered, so the `<GitlabReadme>` / `<GitlabFile>` components behave like the
 * `{@includeGitlab…}` loader path. No-op when the source has no directive.
 */
async function expandDirectives(
  ctx: GitLabContext,
  project: string,
  ref: string,
  path: string | undefined,
  md: string,
): Promise<string> {
  if (!md.includes("::include")) return md;
  const log = await createIncludeLogger(ctx.options.debug ?? false);
  const expand = expandIncludes({
    ctx,
    project,
    ref,
    path,
    allowedHosts: ctx.options.allowedHosts ?? [],
    strict: ctx.options.strict ?? true,
    log,
  });
  return expand(md);
}

type Attrs = Record<string, unknown>;

async function memo<T>(ctx: GitLabContext, key: string, fn: () => Promise<T>): Promise<T> {
  const hit = await ctx.cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  await ctx.cache.set(key, value);
  return value;
}

function readSectionLayout(value: unknown, attr: string): "list" | "cards" {
  if (value === undefined || value === "list" || value === "cards") {
    return value === undefined ? "list" : value;
  }
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabProjectInfo> "${attr}" must be "list" or "cards"; ` +
      `got ${JSON.stringify(value)}.`,
  );
}

export async function fetchProjectInfo(ctx: GitLabContext, attrs: Attrs): Promise<ProjectInfoData> {
  const project = String(attrs.project);
  // Validate presentational layout literals early (values are read by the component).
  readSectionLayout(attrs.releasesLayout, "releasesLayout");
  readSectionLayout(attrs.commitsLayout, "commitsLayout");
  readSectionLayout(attrs.issuesLayout, "issuesLayout");

  const rN = typeof attrs.releases === "number" ? attrs.releases : 0;
  const cN = typeof attrs.commits === "number" ? attrs.commits : 0;
  const iN = typeof attrs.issues === "number" ? attrs.issues : 0;
  const strict = ctx.options.strict ?? true;

  async function section<T>(count: number, fn: () => Promise<T[]>): Promise<T[] | undefined> {
    if (!(count > 0)) return undefined;
    try {
      return await fn();
    } catch (err) {
      if (strict) throw err;
      return undefined;
    }
  }

  return memo(ctx, `projectInfo:${project}:r${rN}:c${cN}:i${iN}`, async () => {
    const p = await ctx.client.getProject(attrs.project as string | number, { statistics: true });
    const avatarUrl = p.avatar_url ? await ctx.assets.localize(p.avatar_url, "", project) : null;
    const contributorsCount = await ctx.client
      .getContributorsCount(attrs.project as string | number)
      .catch(() => undefined);
    const [releases, commits, issues] = await Promise.all([
      section(rN, () => fetchReleases(ctx, { project, limit: rN })),
      section(cN, () => fetchCommits(ctx, { project, limit: cN })),
      section(iN, () => fetchIssues(ctx, { project, limit: iN })),
    ]);
    const base: ProjectInfoData = {
      id: p.id,
      path: p.path_with_namespace,
      name: p.name,
      descriptionHtml: await renderMarkdown(p.description ?? "", { renderChain: ctx.options.markdownRenderChain }),
      webUrl: p.web_url,
      starCount: p.star_count,
      forksCount: p.forks_count,
      topics: p.topics ?? [],
      createdAt: p.created_at,
      lastActivityAt: p.last_activity_at,
      avatarUrl,
    };
    if (typeof p.statistics?.commit_count === "number") base.commitCount = p.statistics.commit_count;
    if (typeof p.statistics?.repository_size === "number") base.repositorySize = p.statistics.repository_size;
    if (p.issues_enabled && typeof p.open_issues_count === "number") base.openIssuesCount = p.open_issues_count;
    if (typeof contributorsCount === "number") base.contributorsCount = contributorsCount;
    if (releases) base.releases = releases;
    if (commits) base.commits = commits;
    if (issues) base.issues = issues;
    return base;
  }).then((v) => ({ ...v, path: v.path || project }));
}

export async function fetchReleases(ctx: GitLabContext, attrs: Attrs): Promise<ReleaseData[]> {
  const project = String(attrs.project);
  const limit = typeof attrs.limit === "number" ? attrs.limit : 10;
  const includePre = attrs.includePrereleases === true;
  return memo(ctx, `releases:${project}:${limit}:${includePre}`, async () => {
    const raw = await ctx.client.getReleases(attrs.project as string | number, limit);
    const filtered = includePre ? raw : raw.filter((r: any) => !r.upcoming_release);
    return Promise.all(
      filtered.slice(0, limit).map(async (r: any) => ({
        name: r.name,
        tagName: r.tag_name,
        releasedAt: r.released_at,
        descriptionHtml: await renderMarkdown(r.description ?? "", { renderChain: ctx.options.markdownRenderChain }),
        upcomingRelease: Boolean(r.upcoming_release),
        assets: (r.assets?.links ?? []).map((l: any) => ({ name: l.name, url: l.url })),
        webUrl: r._links?.self,
      })),
    );
  });
}

export async function fetchIssues(ctx: GitLabContext, attrs: Attrs): Promise<IssueData[]> {
  const project = String(attrs.project);
  const limit = typeof attrs.limit === "number" ? attrs.limit : 20;
  const params = {
    state: (attrs.state as string) ?? "opened",
    labels: attrs.labels as string | undefined,
    milestone: attrs.milestone as string | undefined,
  };
  return memo(ctx, `issues:${project}:${JSON.stringify(params)}:${limit}`, async () => {
    const raw = await ctx.client.getIssues(attrs.project as string | number, { ...params, limit });
    return raw.map((i: any) => ({
      iid: i.iid,
      title: i.title,
      state: i.state,
      webUrl: i.web_url,
      labels: i.labels ?? [],
      authorName: i.author?.name ?? "",
      authorWebUrl: i.author?.web_url ?? "",
      createdAt: i.created_at,
    } satisfies IssueData));
  });
}

export async function fetchCommits(ctx: GitLabContext, attrs: Attrs): Promise<CommitData[]> {
  const project = String(attrs.project);
  const limit = typeof attrs.limit === "number" ? attrs.limit : 10;
  return memo(ctx, `commits:${project}:${limit}`, async () => {
    const raw = await ctx.client.getCommits(attrs.project as string | number, limit);
    return raw.map((c: any) => ({
      shortId: c.short_id,
      title: c.title,
      webUrl: c.web_url,
      authorName: c.author_name ?? "",
      createdAt: c.created_at,
    } satisfies CommitData));
  });
}

interface OrderSpec {
  field: "name";
  dir: "asc" | "desc";
}

function readOrder(value: unknown): OrderSpec {
  if (value === undefined || value === "name" || value === "name:asc") {
    return { field: "name", dir: "asc" };
  }
  if (value === "name:desc") return { field: "name", dir: "desc" };
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: "order" must be one of "name", "name:asc", ` +
      `"name:desc"; got ${JSON.stringify(value)}.`,
  );
}

function compileFilter(value: unknown): ((text: string) => boolean) | null {
  if (value === undefined) return null;
  const pattern = String(value);
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: "filter" is not a valid regular expression: ${pattern}`,
    );
  }
  return (text: string) => re.test(text);
}

function sortByName<T>(items: T[], get: (item: T) => string, dir: "asc" | "desc"): T[] {
  const sorted = [...items].sort((a, b) => get(a).localeCompare(get(b)));
  return dir === "desc" ? sorted.reverse() : sorted;
}

function readTocMode(value: unknown): TocMode {
  if (value === undefined) return "auto";
  if (value === "hidden" || value === "inline" || value === "sidebar") return value;
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabReadme> "toc" must be one of ` +
      `"hidden", "inline", "sidebar"; got ${JSON.stringify(value)}.`,
  );
}

export async function fetchReadme(ctx: GitLabContext, attrs: Attrs): Promise<ReadmeData> {
  const project = String(attrs.project);
  const explicitRef = attrs.ref as string | undefined;
  const tocMode = readTocMode(attrs.toc);
  return memo(ctx, `readme:${project}:${explicitRef ?? "default"}:${tocMode}`, async () => {
    const ref =
      explicitRef ?? (await ctx.client.getProject(attrs.project as string | number)).default_branch;
    const rawMd = await ctx.client.getFileRaw(attrs.project as string | number, "README.md", ref);
    const md = await expandDirectives(ctx, project, ref, undefined, rawMd);
    const collectToc: TocEntry[] = [];
    const html = await renderMarkdown(md, {
      tocMode,
      collectToc,
      transformImageSrc: (src) => ctx.assets.localize(src, ref, project),
      renderChain: ctx.options.markdownRenderChain,
    });
    const result: ReadmeData = { ref, html };
    if (tocMode === "sidebar") result.toc = collectToc;
    return result;
  });
}

function applyLineRange(text: string, lines?: string): string {
  if (!lines) return text;
  const match = /^(\d+)(?:-(\d+))?$/.exec(lines.trim());
  if (!match) return text;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  const allLines = text.split("\n");
  return allLines.slice(start - 1, end).join("\n");
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  php: "php",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  sh: "bash",
  bash: "bash",
  md: "markdown",
  mdx: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  sql: "sql",
  kt: "kotlin",
  swift: "swift",
  xml: "xml",
  dockerfile: "dockerfile",
};

function languageFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dotIndex = base.lastIndexOf(".");
  const ext = (dotIndex === -1 ? base : base.slice(dotIndex + 1)).toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] ?? ext ?? "text";
}

const PAGE_SIZE = 100;
const MAX_PAGES = 5; // hard ceiling: 5 * 100 = 500 topics/labels fetched

/**
 * Bound the fetch to 500 items. When the component sets `limit` and there is no
 * name filter, fetch only enough pages to satisfy it; a filter forces the full
 * ceiling because a match can land on any page.
 */
function pageOptions(limit: number | undefined, hasFilter: boolean): PageOptions {
  const maxPages =
    limit !== undefined && !hasFilter
      ? Math.min(MAX_PAGES, Math.max(1, Math.ceil(limit / PAGE_SIZE)))
      : MAX_PAGES;
  return { perPage: PAGE_SIZE, maxPages };
}

export async function fetchTopics(ctx: GitLabContext, attrs: Attrs): Promise<TopicData[]> {
  const order = readOrder(attrs.order);
  const match = compileFilter(attrs.filter);
  const limit = typeof attrs.limit === "number" ? attrs.limit : undefined;
  const host = ctx.options.host;
  const key = `topics:${String(attrs.filter ?? "")}:${order.dir}:${limit ?? "all"}`;
  return memo(ctx, key, async () => {
    const raw = await ctx.client.getTopics(pageOptions(limit, match !== null));
    let items: TopicData[] = raw.map((t: any) => ({
      name: t.name,
      title: t.title ?? t.name,
      totalProjectsCount: t.total_projects_count ?? 0,
      webUrl: `${host}/explore/projects/topics/${encodeURIComponent(t.name)}`,
    }));
    if (match) items = items.filter((t) => match(t.title));
    items = sortByName(items, (t) => t.title, order.dir);
    if (limit !== undefined) items = items.slice(0, limit);
    return items;
  });
}

function readLayout(value: unknown): "list" | "cards" {
  if (value === undefined || value === "list" || value === "cards") {
    return value === undefined ? "list" : value;
  }
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabLabels> "layout" must be "list" or "cards"; ` +
      `got ${JSON.stringify(value)}.`,
  );
}

export async function fetchLabels(ctx: GitLabContext, attrs: Attrs): Promise<LabelData[]> {
  const project = attrs.project as string | number | undefined;
  const group = attrs.group as string | number | undefined;
  if ((project === undefined) === (group === undefined)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabLabels> requires exactly one of "project" or "group".`,
    );
  }
  readLayout(attrs.layout); // validate only; layout is presentational (read by the component)
  const order = readOrder(attrs.order);
  const match = compileFilter(attrs.filter);
  const limit = typeof attrs.limit === "number" ? attrs.limit : undefined;
  const scopeKey = project !== undefined ? `p:${String(project)}` : `g:${String(group)}`;
  const key = `labels:${scopeKey}:${String(attrs.filter ?? "")}:${order.dir}:${limit ?? "all"}`;
  return memo(ctx, key, async () => {
    let raw: any[];
    let base: string;
    const pages = pageOptions(limit, match !== null);
    if (project !== undefined) {
      raw = await ctx.client.getProjectLabels(project, pages);
      base = (await ctx.client.getProject(project)).web_url;
    } else {
      raw = await ctx.client.getGroupLabels(group as string | number, pages);
      base = (await ctx.client.getGroup(group as string | number)).web_url;
    }
    let items: LabelData[] = raw
      .filter((l) => l.archived !== true)
      .map((l) => ({
        name: l.name,
        color: l.color,
        textColor: l.text_color,
        description: l.description ?? null,
        webUrl: `${base}/-/issues?label_name[]=${encodeURIComponent(l.name)}`,
      }));
    if (match) items = items.filter((l) => match(l.name));
    items = sortByName(items, (l) => l.name, order.dir);
    if (limit !== undefined) items = items.slice(0, limit);
    return items;
  });
}

/**
 * Normalize a snake_case user/member payload to `UserData`. Fields the payload
 * lacks (members payloads have no profile fields) become null.
 */
async function normalizeUser(ctx: GitLabContext, u: any, role?: string): Promise<UserData> {
  // Avatar URLs are absolute; the "user/<username>" scope only namespaces the local asset.
  const avatarUrl = u.avatar_url ? await ctx.assets.localize(u.avatar_url, "", `user/${u.username}`) : null;
  return {
    id: u.id,
    username: u.username,
    name: u.name ?? u.username,
    webUrl: u.web_url,
    avatarUrl,
    ...(role === undefined ? {} : { role }),
    jobTitle: u.job_title ?? null,
    organization: u.organization ?? null,
    location: u.location ?? null,
    bio: u.bio ?? null,
    followers: typeof u.followers === "number" ? u.followers : null,
    following: typeof u.following === "number" ? u.following : null,
    createdAt: u.created_at ?? null,
  };
}

/**
 * Resolve a username to its full profile. Memoized per username so members
 * shared across pages/components cost one lookup per build; `show` never
 * affects this data.
 */
async function fetchUserProfile(ctx: GitLabContext, username: string): Promise<UserData> {
  return memo(ctx, `userByName:${username.toLowerCase()}`, async () => {
    const matches = await ctx.client.getUserByUsername(username);
    const found = matches.find((u: any) => String(u.username).toLowerCase() === username.toLowerCase());
    if (!found) {
      throw new Error(`@ebuildy/docusaurus-plugin-gitlab: GitLab user "${username}" not found.`);
    }
    return normalizeUser(ctx, await ctx.client.getUser(found.id));
  });
}

export async function fetchUser(ctx: GitLabContext, attrs: Attrs): Promise<UserData> {
  const name = typeof attrs.name === "string" ? attrs.name.trim() : "";
  if (!name) {
    throw new Error(`@ebuildy/docusaurus-plugin-gitlab: <GitlabUser> requires a "name" (GitLab username).`);
  }
  parseShow(attrs.show, "GitlabUser"); // validate only; `show` is presentational (read by the component)
  return fetchUserProfile(ctx, name);
}

export async function fetchUsers(ctx: GitLabContext, attrs: Attrs): Promise<UserData[]> {
  const project = attrs.project as string | number | undefined;
  const group = attrs.group as string | number | undefined;
  if ((project === undefined) === (group === undefined)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabUsers> requires exactly one of "project" or "group".`,
    );
  }
  const show = parseShow(attrs.show, "GitlabUsers");
  const enrich = needsProfile(show);
  const role = parseRole(attrs.role);
  const limit = attrs.limit === undefined ? undefined : Number(attrs.limit);
  if (limit !== undefined && !(Number.isFinite(limit) && limit > 0)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabUsers> "limit" must be a positive number; ` +
        `got ${JSON.stringify(attrs.limit)}.`,
    );
  }
  const scopeKey = project !== undefined ? `p:${String(project)}` : `g:${String(group)}`;
  const key = `users:${scopeKey}:role=${role ?? "all"}:limit=${limit ?? "all"}:enrich=${enrich ? 1 : 0}`;
  return memo(ctx, key, async () => {
    const raw =
      project !== undefined
        ? await ctx.client.getProjectMembers(project)
        : await ctx.client.getGroupMembers(group as string | number);
    // /members/all can list a user under several ancestors — keep the first occurrence.
    const seen = new Set<number>();
    let members = raw.filter((m: any) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    if (role !== undefined) members = members.filter((m: any) => roleName(m.access_level) === role);
    members = sortByName(members, (m: any) => String(m.name ?? m.username), "asc");
    if (limit !== undefined) members = members.slice(0, limit);
    if (!enrich) {
      return Promise.all(members.map((m: any) => normalizeUser(ctx, m, roleName(m.access_level))));
    }
    // Sequential on purpose: keeps the request pattern gentle; each profile is
    // individually memoized so repeat builds and shared members are free.
    const users: UserData[] = [];
    for (const m of members) {
      const full = await fetchUserProfile(ctx, m.username);
      users.push({ ...full, role: roleName(m.access_level) });
    }
    return users;
  });
}

/** Parse a topic list attribute: `["a","b"]`, `"a,b"`, or undefined → string[]. */
function parseTopicList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function asBool(value: unknown): boolean {
  return value === true || value === "true";
}

export async function fetchGroup(ctx: GitLabContext, group: string | number): Promise<any> {
  return memo(ctx, `group:${String(group)}`, () => ctx.client.getGroup(group));
}

export async function fetchGroupProjects(ctx: GitLabContext, attrs: Attrs): Promise<GroupProjectData[]> {
  const group = attrs.group as string | number | undefined;
  if (group === undefined) {
    throw new Error(`@ebuildy/docusaurus-plugin-gitlab: <GitlabProjectGrid> requires a "group".`);
  }
  const includeSubgroups = asBool(attrs.includeSubgroups);
  const includeArchived = asBool(attrs.includeArchived);
  const topics = parseTopicList(attrs.topics);
  const key = `groupProjects:${String(group)}:sub=${includeSubgroups}:arch=${includeArchived}:t=${topics.join(",")}`;
  return memo(ctx, key, async () => {
    const info = await fetchGroup(ctx, group);
    const prefix = `${String(info.full_path)}/`;
    const raw = await ctx.client.getGroupProjects(group, {
      includeSubgroups,
      archived: includeArchived ? undefined : false,
    });
    let items: GroupProjectData[] = raw.map((p: any) => {
      const pathWithNamespace = String(p.path_with_namespace);
      return {
        id: p.id,
        name: p.name,
        path: p.path,
        pathWithNamespace,
        slug: pathWithNamespace.startsWith(prefix) ? pathWithNamespace.slice(prefix.length) : p.path,
        description: p.description ?? null,
        webUrl: p.web_url,
        starCount: p.star_count ?? 0,
        defaultBranch: p.default_branch ?? null,
        topics: Array.isArray(p.topics) ? p.topics : [],
      };
    });
    if (topics.length) items = items.filter((p) => topics.every((t) => p.topics.includes(t)));
    items = sortByName(items, (p) => p.slug, "asc");
    return items;
  });
}

export async function fetchFile(ctx: GitLabContext, attrs: Attrs): Promise<FileData> {
  const project = attrs.project as string | number;
  const path = String(attrs.path);
  const explicitRef = attrs.ref as string | undefined;
  const lines = attrs.lines as string | undefined;
  return memo(
    ctx,
    `file:${String(project)}:${path}:${explicitRef ?? "default"}:${lines ?? ""}`,
    async () => {
      const ref = explicitRef ?? (await ctx.client.getProject(project)).default_branch;
      const raw = await ctx.client.getFileRaw(project, path, ref);
      if (/\.mdx?$/i.test(path)) {
        const expanded = await expandDirectives(ctx, String(project), ref, path, raw);
        const html = await renderMarkdown(expanded, {
          transformImageSrc: (src) => ctx.assets.localize(src, ref, String(project)),
          renderChain: ctx.options.markdownRenderChain,
        });
        return { kind: "markdown", html, ref, path } satisfies FileData;
      }
      const code = applyLineRange(raw, lines);
      const language = languageFromPath(path);
      return { kind: "code", code, language, ref, path } satisfies FileData;
    },
  );
}

export interface SourceResult {
  raw: string;
  ref: string;
}

export async function fetchReadmeSource(
  ctx: GitLabContext,
  args: { project: string; ref?: string },
): Promise<SourceResult> {
  return memo(ctx, `readmeSource:${args.project}:${args.ref ?? "default"}`, async () => {
    const ref = args.ref ?? (await ctx.client.getProject(args.project)).default_branch;
    const raw = await ctx.client.getFileRaw(args.project, "README.md", ref);
    return { raw, ref } satisfies SourceResult;
  });
}

export async function fetchFileSource(
  ctx: GitLabContext,
  args: { project: string; path: string; ref?: string },
): Promise<SourceResult> {
  return memo(ctx, `fileSource:${args.project}:${args.path}:${args.ref ?? "default"}`, async () => {
    const ref = args.ref ?? (await ctx.client.getProject(args.project)).default_branch;
    const raw = await ctx.client.getFileRaw(args.project, args.path, ref);
    return { raw, ref } satisfies SourceResult;
  });
}

function readRoadmapSource(value: unknown): "epics" | "milestones" {
  if (value === undefined || value === "epics") return "epics";
  if (value === "milestones") return "milestones";
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap> "source" must be "epics" or "milestones"; got ${JSON.stringify(value)}.`,
  );
}

function readRoadmapScale(value: unknown): RoadmapScale | undefined {
  if (value === undefined) return undefined;
  if (value === "quarters" || value === "months" || value === "weeks") return value;
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap> "scale" must be "quarters", "months", or "weeks"; got ${JSON.stringify(value)}.`,
  );
}

function readRoadmapOrder(value: unknown): "start" | "due" | "title" {
  if (value === undefined || value === "start") return "start";
  if (value === "due" || value === "title") return value;
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap> "order" must be "start", "due", or "title"; got ${JSON.stringify(value)}.`,
  );
}

function readRoadmapGroupBy(value: unknown): "none" | "label" | "parent" {
  if (value === undefined || value === "none") return "none";
  if (value === "label" || value === "parent") return value;
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap> "groupBy" must be "none", "label", or "parent"; got ${JSON.stringify(value)}.`,
  );
}

function readRoadmapDate(value: unknown, attr: string): string | undefined {
  if (value === undefined) return undefined;
  const s = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap> "${attr}" must be an ISO date (YYYY-MM-DD); got ${JSON.stringify(value)}.`,
    );
  }
  return s;
}

/** Build a name→LabelRef lookup from group/project labels for color resolution. */
async function labelIndex(
  ctx: GitLabContext,
  scope: { group?: string | number; project?: string | number },
): Promise<Map<string, LabelRef>> {
  const raw =
    scope.project !== undefined
      ? await ctx.client.getProjectLabels(scope.project).catch(() => [])
      : scope.group !== undefined
        ? await ctx.client.getGroupLabels(scope.group).catch(() => [])
        : [];
  const idx = new Map<string, LabelRef>();
  for (const l of raw as any[]) {
    idx.set(l.name, { name: l.name, color: l.color, textColor: l.text_color });
  }
  return idx;
}

function resolveLabels(names: string[], idx: Map<string, LabelRef>): LabelRef[] {
  return names.map(
    (name) => idx.get(name) ?? { name, color: "#e5e7eb", textColor: "#1f2937" },
  );
}

export async function fetchRoadmap(ctx: GitLabContext, attrs: Attrs): Promise<RoadmapData> {
  const source = readRoadmapSource(attrs.source);
  const group = attrs.group as string | number | undefined;
  const project = attrs.project as string | number | undefined;
  const scale = readRoadmapScale(attrs.scale);
  const order = readRoadmapOrder(attrs.order);
  const groupBy = readRoadmapGroupBy(attrs.groupBy);
  const state = (attrs.state as string) ?? "opened";
  const labels = attrs.labels as string | undefined;
  const from = readRoadmapDate(attrs.from, "from");
  const to = readRoadmapDate(attrs.to, "to");
  const limit = typeof attrs.limit === "number" ? attrs.limit : 50;

  if (source === "epics" && group === undefined) {
    throw new Error(`@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap source="epics"> requires a "group".`);
  }
  if (source === "milestones" && (group === undefined) === (project === undefined)) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap source="milestones"> requires exactly one of "project" or "group".`,
    );
  }

  const scopeKey = project !== undefined ? `p:${String(project)}` : `g:${String(group)}`;
  const key = `roadmap:${source}:${scopeKey}:${state}:${labels ?? ""}:${from ?? ""}:${to ?? ""}:${scale ?? "auto"}:${order}:${groupBy}:${limit}`;

  // On failure this simply throws; the remark layer (src/remark/index.ts) turns a
  // thrown fetch into an `error` prop (Fallback) when `strict` is false, and
  // aborts the build when true — identical to every other fetcher.
  return memo(ctx, key, async () => {
    const buildOpts: BuildRoadmapOptions = { source, order, groupBy };
    if (scale) buildOpts.scale = scale;
    if (from) buildOpts.from = from;
    if (to) buildOpts.to = to;

    const items =
      source === "epics"
        ? await fetchEpicItems(ctx, group!, { state, labels, order }, limit)
        : await fetchMilestoneItems(ctx, { group, project }, state, limit);

    return buildRoadmap(items, buildOpts);
  });
}

async function fetchEpicItems(
  ctx: GitLabContext,
  group: string | number,
  q: { state: string; labels?: string; order: "start" | "due" | "title" },
  limit: number,
): Promise<RoadmapItemData[]> {
  // The Epics API's order_by only accepts created_at | updated_at | title — NOT
  // start_date/due_date. start/due ordering is applied client-side in buildRoadmap;
  // here we pass a valid API value so GitLab doesn't reject the request.
  const orderBy = q.order === "title" ? "title" : "created_at";
  const raw = await ctx.client.getGroupEpics(group, {
    state: q.state,
    ...(q.labels ? { labels: q.labels } : {}),
    orderBy,
    sort: "asc",
  });
  const idx = await labelIndex(ctx, { group });
  const byId = new Map<number, any>(raw.map((e: any) => [e.id, e]));
  return raw.slice(0, limit).map((e: any) => ({
    id: e.id,
    iid: e.iid,
    title: e.title,
    state: e.state === "closed" ? "closed" : "opened",
    startDate: e.start_date ?? null,
    dueDate: e.due_date ?? null,
    webUrl: e.web_url,
    color: e.color,
    progress: computeProgress(e.descendant_counts),
    parentId: e.parent_id ?? null,
    // parentTitle resolves only within the fetched page; a parent outside the
    // result set (filtered out or beyond the page ceiling) yields null → grouped under "(no parent)".
    parentTitle: e.parent_id != null ? byId.get(e.parent_id)?.title ?? null : null,
    labels: resolveLabels(Array.isArray(e.labels) ? e.labels : [], idx),
  } satisfies RoadmapItemData));
}

async function fetchMilestoneItems(
  ctx: GitLabContext,
  scope: { group?: string | number; project?: string | number },
  state: string,
  limit: number,
): Promise<RoadmapItemData[]> {
  // Milestone API state vocabulary is active/closed; map our opened→active.
  const apiState = state === "opened" ? "active" : state; // "closed" and "all" pass through
  const raw =
    scope.project !== undefined
      ? await ctx.client.getProjectMilestones(scope.project)
      : await ctx.client.getGroupMilestones(scope.group!);
  const filtered =
    apiState === "all" ? raw : raw.filter((m: any) => m.state === apiState);
  return filtered.slice(0, limit).map((m: any) => ({
    id: m.id,
    iid: m.iid,
    title: m.title,
    state: m.state === "closed" ? "closed" : "opened",
    startDate: m.start_date ?? null,
    dueDate: m.due_date ?? null,
    webUrl: m.web_url,
    progress: null,
    parentId: null,
    parentTitle: null,
    labels: [],
  } satisfies RoadmapItemData));
}

/** GitLab epic list payloads may include descendant issue counts; derive % from them. */
function computeProgress(counts: any): number | null {
  if (!counts) return null;
  const opened = Number(counts.opened_issues ?? 0);
  const closed = Number(counts.closed_issues ?? 0);
  const total = opened + closed;
  return total > 0 ? Math.round((closed / total) * 100) : null;
}
