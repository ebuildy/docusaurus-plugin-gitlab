import type { AssetManager } from "./assets";
import type { FileCache } from "./cache";
import type { GitLabClient } from "./client";
import { applyLineRange, languageFromPath } from "./code.js";
import { renderMarkdown } from "./markdown.js";
import type { TocEntry, TocMode } from "./toc.js";
import type {
  FileData,
  IssueData,
  ProjectInfoData,
  ReadmeData,
  ReleaseData,
} from "./types";

export interface GitLabContext {
  client: GitLabClient;
  cache: FileCache;
  assets: AssetManager;
  options: { host: string };
}

type Attrs = Record<string, unknown>;

async function memo<T>(ctx: GitLabContext, key: string, fn: () => Promise<T>): Promise<T> {
  const hit = await ctx.cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  await ctx.cache.set(key, value);
  return value;
}

export async function fetchProjectInfo(ctx: GitLabContext, attrs: Attrs): Promise<ProjectInfoData> {
  const project = String(attrs.project);
  return memo(ctx, `projectInfo:${project}`, async () => {
    const p = await ctx.client.getProject(attrs.project as string | number);
    const avatarUrl = p.avatar_url
      ? await ctx.assets.localize(p.avatar_url, "", project)
      : null;
    return {
      id: p.id,
      path: p.path_with_namespace,
      name: p.name,
      description: p.description ?? null,
      webUrl: p.web_url,
      starCount: p.star_count,
      forksCount: p.forks_count,
      topics: p.topics ?? [],
      lastActivityAt: p.last_activity_at,
      avatarUrl,
    } satisfies ProjectInfoData;
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
        descriptionHtml: await renderMarkdown(r.description ?? "", {}),
        upcomingRelease: Boolean(r.upcoming_release),
        assets: (r.assets?.links ?? []).map((l: any) => ({ name: l.name, url: l.url })),
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
    const md = await ctx.client.getFileRaw(attrs.project as string | number, "README.md", ref);
    const collectToc: TocEntry[] = [];
    const html = await renderMarkdown(md, {
      tocMode,
      collectToc,
      transformImageSrc: (src) => ctx.assets.localize(src, ref, project),
    });
    const result: ReadmeData = { ref, html };
    if (tocMode === "sidebar") result.toc = collectToc;
    return result;
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
        const html = await renderMarkdown(raw, {
          transformImageSrc: (src) => ctx.assets.localize(src, ref, String(project)),
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
