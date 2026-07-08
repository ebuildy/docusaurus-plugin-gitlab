# GitlabProjectInfo Sections + Extended Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in embedded releases/commits/issues sections (with a title-link override) and extra stat pills (commits, contributors, open issues, repo size) to `<GitlabProjectInfo>`.

**Architecture:** `fetchProjectInfo` stays the single fetcher for the element. It composes the existing `fetchReleases`/`fetchIssues` plus a new `fetchCommits` for the sections, and reads project `statistics` + a contributors count for the stats. All extra data is attached to `ProjectInfoData` as optional fields. The pure `GitlabProjectInfo` component renders sections (compact `list` default, opt-in `cards`) right after the description, and appends stat pills inside the existing `showStats` row. Section attributes are count-gated (no fetch when unset/≤0); stats are best-effort (never abort the build).

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), `@gitbeaker/rest`, React (SSR), Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-08-projectinfo-sections-design.md`

**Conventions (read before starting):**
- ESM-only: every intra-package import uses an explicit `.js` extension.
- gitbeaker responses are snake_case; normalize to camelCase in fetchers.
- Component attribute values are static literals only; the remark plugin injects a `data` prop and leaves all other MDX attributes (e.g. `link`, `releasesLayout`, `showStats`) as props on the element — they flow straight to the React component.
- Component styling uses plain global class names (e.g. `gitlab-badge`, `gitlab-muted`, `gitlab-title`) — this file does NOT use CSS modules. Reuse existing classes; add new semantic class names freely (no new CSS file required).
- After each task run `npx vitest run <file>` for the touched tests; run `npm run typecheck` before the final commit of each feature.
- Commits are GPG-signed automatically (`commit.gpgsign=true`). Verify with `git log -1 --format='%G?'` (expect `G`).

---

# FEATURE 1 — Embedded releases / commits / issues sections

## File structure (Feature 1)

- Modify `src/gitlab/client.ts` — add `getCommits`.
- Modify `src/gitlab/types.ts` — add `CommitData`; add `releases`/`commits`/`issues` to `ProjectInfoData`.
- Modify `src/gitlab/fetchers.ts` — add `fetchCommits`; compose sections + validate layouts in `fetchProjectInfo`.
- Modify `src/components/GitlabProjectInfo.tsx` — render sections + `link` override.
- Modify `src/components/types.ts`, `src/components/index.ts`, `src/index.ts` — re-export `CommitData`.
- Tests: `src/gitlab/client.test.ts`, `src/gitlab/fetchers.test.ts`, `src/components/GitlabProjectInfo.test.tsx`.
- Docs: `README.md`, `examples/site/docs/components/*ProjectInfo*`.

---

## Task 1: `getCommits` client method

**Files:**
- Modify: `src/gitlab/client.ts` (add method after `getIssues`)
- Test: `src/gitlab/client.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/gitlab/client.test.ts`, add a `commitsAllMock` alongside the other mocks. Add it to the mocked `Gitlab` return object as `Commits: { all: commitsAllMock }`, and reset it in `beforeEach` (`commitsAllMock.mockReset()`). Then add this test inside `describe("GitLabClient", ...)`:

```ts
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
```

Declare the mock at the top with the others: `const commitsAllMock = vi.fn();`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/client.test.ts -t "getCommits"`
Expected: FAIL — `client.getCommits is not a function`.

- [ ] **Step 3: Implement `getCommits`**

In `src/gitlab/client.ts`, add after `getIssues`:

```ts
  async getCommits(project: ProjectRef, limit: number): Promise<any[]> {
    const commits = await this.api.Commits.all(project, { perPage: limit, maxPages: 1 });
    return commits.slice(0, limit);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gitlab/client.test.ts -t "getCommits"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/client.ts src/gitlab/client.test.ts
git commit -m "feat: add getCommits to GitLabClient"
```

---

## Task 2: `CommitData` type + `fetchCommits` fetcher

**Files:**
- Modify: `src/gitlab/types.ts` (add `CommitData`)
- Modify: `src/gitlab/fetchers.ts` (add `fetchCommits`)
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Add the `CommitData` type**

In `src/gitlab/types.ts`, add after `IssueData`:

```ts
export interface CommitData {
  shortId: string;
  title: string;
  webUrl: string;
  authorName: string;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test**

In `src/gitlab/fetchers.test.ts`, import `fetchCommits` in the existing import from `./fetchers`. Add:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t "fetchCommits"`
Expected: FAIL — `fetchCommits is not exported` / not a function.

- [ ] **Step 4: Implement `fetchCommits`**

In `src/gitlab/fetchers.ts`, add `CommitData` to the type import from `./types`, and add this fetcher after `fetchIssues`:

```ts
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
```

Also add `getCommits` to the `GitLabClient` type surface used by fetchers if a local interface exists — it does not; fetchers call `ctx.client` (typed `GitLabClient`), so no extra change beyond Task 1.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t "fetchCommits"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/types.ts src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: add CommitData type and fetchCommits fetcher"
```

---

## Task 3: Compose sections into `fetchProjectInfo`

**Files:**
- Modify: `src/gitlab/types.ts` (extend `ProjectInfoData`)
- Modify: `src/gitlab/fetchers.ts` (`fetchProjectInfo` + layout validator)
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Extend `ProjectInfoData`**

In `src/gitlab/types.ts`, add optional fields to `ProjectInfoData` (after `avatarUrl`):

```ts
  releases?: ReleaseData[];
  commits?: CommitData[];
  issues?: IssueData[];
```

- [ ] **Step 2: Write the failing tests**

In `src/gitlab/fetchers.test.ts`, add inside `describe("fetchProjectInfo", ...)`:

```ts
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
  };
  const c = ctx(client);
  c.options.strict = true;
  await expect(fetchProjectInfo(c, { project: "g/r", releases: 2 })).rejects.toThrow("boom");
});

it("rejects an invalid section layout", async () => {
  const client = { getProject: vi.fn(async () => ({ id: 1, path_with_namespace: "g/r", name: "r", description: "", web_url: "u", star_count: 0, forks_count: 0, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null })) };
  await expect(fetchProjectInfo(ctx(client), { project: "g/r", releasesLayout: "grid" })).rejects.toThrow(/releasesLayout/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t "fetchProjectInfo"`
Expected: FAIL — new assertions fail (sections not attached, layout not validated).

- [ ] **Step 4: Implement the composition**

In `src/gitlab/fetchers.ts`, add a section-layout validator near `readLayout`:

```ts
function readSectionLayout(value: unknown, attr: string): "list" | "cards" {
  if (value === undefined || value === "list" || value === "cards") {
    return value === undefined ? "list" : value;
  }
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabProjectInfo> "${attr}" must be "list" or "cards"; ` +
      `got ${JSON.stringify(value)}.`,
  );
}
```

Then rewrite `fetchProjectInfo` so it validates layouts up front, builds the base object inside `memo`, and attaches the count-gated sections (respecting `strict`):

```ts
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
    const p = await ctx.client.getProject(attrs.project as string | number);
    const avatarUrl = p.avatar_url ? await ctx.assets.localize(p.avatar_url, "", project) : null;
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
      lastActivityAt: p.last_activity_at,
      avatarUrl,
    };
    if (releases) base.releases = releases;
    if (commits) base.commits = commits;
    if (issues) base.issues = issues;
    return base;
  }).then((v) => ({ ...v, path: v.path || project }));
}
```

Note: `fetchReleases`/`fetchIssues`/`fetchCommits` are hoisted function declarations in the same module, so the forward references are fine.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t "fetchProjectInfo"`
Expected: PASS. Then run the full fetchers file to catch regressions: `npx vitest run src/gitlab/fetchers.test.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/types.ts src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: compose count-gated sections into fetchProjectInfo"
```

---

## Task 4: Render compact sections + `link` override in the component

**Files:**
- Modify: `src/components/GitlabProjectInfo.tsx`
- Test: `src/components/GitlabProjectInfo.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/GitlabProjectInfo.test.tsx`, add:

```ts
it("renders compact release, commit, and issue lines after the description", () => {
  render(<GitlabProjectInfo data={{ ...data,
    releases: [{ name: "First", tagName: "v1.0", releasedAt: "2026-01-01T00:00:00Z", descriptionHtml: "", upcomingRelease: false, assets: [] }],
    commits: [{ shortId: "a1b2c3d", title: "fix: bug", webUrl: "https://gitlab.com/c/a1b2c3d", authorName: "Ada", createdAt: "2026-01-02T00:00:00Z" }],
    issues: [{ iid: 42, title: "Broken thing", state: "opened", webUrl: "https://gitlab.com/i/42", labels: [], authorName: "Ada", authorWebUrl: "", createdAt: "2026-01-03T00:00:00Z" }],
  } as any} />);
  expect(screen.getByText("First")).toBeInTheDocument();
  expect(screen.getByText("v1.0")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "a1b2c3d" })).toHaveAttribute("href", "https://gitlab.com/c/a1b2c3d");
  expect(screen.getByText("fix: bug")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Broken thing/ })).toHaveAttribute("href", "https://gitlab.com/i/42");
});

it("renders no section blocks when arrays are absent", () => {
  const { container } = render(<GitlabProjectInfo data={data as any} />);
  expect(container.querySelector(".gitlab-section")).toBeNull();
});

it("overrides the title link when link is provided", () => {
  render(<GitlabProjectInfo data={data as any} link="https://example.com/app" />);
  expect(screen.getByRole("link", { name: "My Repo" })).toHaveAttribute("href", "https://example.com/app");
});

it("defaults the title link to the project webUrl", () => {
  render(<GitlabProjectInfo data={data as any} />);
  expect(screen.getByRole("link", { name: "My Repo" })).toHaveAttribute("href", "https://gitlab.com/g/r");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx`
Expected: FAIL — sections not rendered, `link` not applied.

- [ ] **Step 3: Implement sections + link override**

Rewrite `src/components/GitlabProjectInfo.tsx`. Update the imports and props, add a `SectionLayout` type + three local render helpers, use `link` for the title href, and render the sections right after the description block:

```tsx
import React from "react";
import { Fallback } from "./Fallback.js";
import { formatCount } from "./format.js";
import type { ComponentPayload, ProjectInfoData, ReleaseData, CommitData, IssueData } from "./types.js";

type SectionLayout = "list" | "cards";

interface ProjectInfoProps extends ComponentPayload<ProjectInfoData> {
  showStats?: boolean;
  link?: string;
  releasesLayout?: SectionLayout;
  commitsLayout?: SectionLayout;
  issuesLayout?: SectionLayout;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function Releases({ items, layout }: { items: ReleaseData[]; layout: SectionLayout }) {
  return (
    <div className="gitlab-section gitlab-section-releases">
      <div className="gitlab-section-title gitlab-muted">Releases</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((r) => (
          <li key={r.tagName} className="gitlab-section-item">
            <span className="gitlab-badge">{r.tagName}</span>
            <span className="gitlab-section-name"> {r.name || r.tagName}</span>
            {layout === "cards" && (
              <span className="gitlab-muted"> · {shortDate(r.releasedAt)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Commits({ items, layout }: { items: CommitData[]; layout: SectionLayout }) {
  return (
    <div className="gitlab-section gitlab-section-commits">
      <div className="gitlab-section-title gitlab-muted">Latest commits</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((c) => (
          <li key={c.shortId} className="gitlab-section-item">
            <a className="gitlab-commit-sha" href={c.webUrl}>{c.shortId}</a>
            <span className="gitlab-section-name"> {c.title}</span>
            <span className="gitlab-muted"> · {c.authorName} · {shortDate(c.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Issues({ items, layout }: { items: IssueData[]; layout: SectionLayout }) {
  return (
    <div className="gitlab-section gitlab-section-issues">
      <div className="gitlab-section-title gitlab-muted">Issues</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((i) => (
          <li key={i.iid} className="gitlab-section-item">
            <a className="gitlab-issue-title" href={i.webUrl}>#{i.iid} {i.title}</a>
            {layout === "cards" && (
              <span className="gitlab-muted"> · {i.state} · {i.authorName}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GitlabProjectInfo({
  data,
  error,
  showStats = true,
  link,
  releasesLayout = "list",
  commitsLayout = "list",
  issuesLayout = "list",
}: ProjectInfoProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <div className="gitlab-card">
      <div className="gitlab-card-header">
        {data.avatarUrl && (
          <img className="gitlab-avatar" src={data.avatarUrl} alt={data.name} width={32} height={32} />
        )}
        <div className="gitlab-title">
          <a href={link ?? data.webUrl}>{data.name}</a>
        </div>
      </div>
      {data.descriptionHtml && (
        <div
          className="gitlab-description gitlab-muted"
          dangerouslySetInnerHTML={{ __html: data.descriptionHtml }}
        />
      )}
      {data.releases && data.releases.length > 0 && (
        <Releases items={data.releases} layout={releasesLayout} />
      )}
      {data.commits && data.commits.length > 0 && (
        <Commits items={data.commits} layout={commitsLayout} />
      )}
      {data.issues && data.issues.length > 0 && (
        <Issues items={data.issues} layout={issuesLayout} />
      )}
      {data.topics.length > 0 && (
        <div>
          {data.topics.map((t) => (
            <span key={t} className="gitlab-badge">{t}</span>
          ))}
        </div>
      )}
      {showStats && (
        <div className="gitlab-stats">
          <span>★ {formatCount(data.starCount)}</span>
          <span>⑂ {formatCount(data.forksCount)}</span>
          <span className="gitlab-muted">updated {new Date(data.lastActivityAt).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/GitlabProjectInfo.tsx src/components/GitlabProjectInfo.test.tsx
git commit -m "feat: render embedded sections and link override in GitlabProjectInfo"
```

---

## Task 5: `cards` layout coverage + export `CommitData`

**Files:**
- Modify: `src/components/types.ts`, `src/components/index.ts`, `src/index.ts`
- Test: `src/components/GitlabProjectInfo.test.tsx`

- [ ] **Step 1: Write the failing test (cards layout)**

In `src/components/GitlabProjectInfo.test.tsx`, add:

```ts
it("shows richer metadata in cards layout", () => {
  render(<GitlabProjectInfo issuesLayout="cards" data={{ ...data,
    issues: [{ iid: 42, title: "Broken thing", state: "opened", webUrl: "u", labels: [], authorName: "Ada", authorWebUrl: "", createdAt: "2026-01-03T00:00:00Z" }],
  } as any} />);
  expect(screen.getByText(/opened/)).toBeInTheDocument();
  expect(screen.getByText(/Ada/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx -t "cards layout"`
The rendering from Task 4 already implements the `cards` branch, so this test should PASS immediately. If it FAILS, fix the `layout === "cards"` branch in the `Issues` helper. (This task exists to lock in cards behavior and finish exports.)

- [ ] **Step 3: Re-export `CommitData`**

Add `CommitData` to the export list in `src/components/types.ts`:

```ts
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  CommitData,
  ReadmeData,
  FileData,
  TopicData,
  LabelData,
  FetchError,
  ComponentPayload,
} from "../gitlab/types.js";
```

Add `CommitData` to the `export type { … } from "./types.js";` block in `src/components/index.ts` (insert after `IssueData`).

Add `CommitData` to the `export type { … }` block in `src/index.ts` (insert after `IssueData`).

- [ ] **Step 4: Typecheck + run tests**

Run: `npm run typecheck`
Expected: no errors.
Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx src/gitlab/fetchers.test.ts src/gitlab/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/types.ts src/components/index.ts src/index.ts src/components/GitlabProjectInfo.test.tsx
git commit -m "feat: export CommitData and cover cards layout"
```

---

## Task 6: Documentation (Feature 1)

**Files:**
- Modify: `README.md`
- Modify: `examples/site/docs/components/` (the `GitlabProjectInfo` page)

- [ ] **Step 1: Locate the docs**

Run: `grep -rl "GitlabProjectInfo" README.md examples/site/docs`
Open the README section and the example page for `GitlabProjectInfo`.

- [ ] **Step 2: Document the new attributes**

Add an attributes subsection describing: `releases={N}`, `commits={N}`, `issues={N}` (opt-in counts; no fetch when unset/≤0), `releasesLayout` / `commitsLayout` / `issuesLayout` (`"list"` default, `"cards"`), and `link` (overrides the title href, defaults to the project URL). Include a worked example:

```mdx
<GitlabProjectInfo project="group/app" releases={3} commits={5} issues={5} />
<GitlabProjectInfo project="group/app" releases={3} releasesLayout="cards" link="https://example.com/app" />
```

- [ ] **Step 3: Commit**

```bash
git add README.md examples/site/docs
git commit -m "docs: document GitlabProjectInfo embedded sections"
```

---

# FEATURE 2 — Extended project stats

## File structure (Feature 2)

- Create `src/components/formatBytes.ts` — new `formatBytes` helper (kept next to `format.ts`).
- Modify `src/gitlab/client.ts` — `getProject` statistics option + `getContributorsCount`.
- Modify `src/gitlab/types.ts` — add stat fields to `ProjectInfoData`.
- Modify `src/gitlab/fetchers.ts` — map stats in `fetchProjectInfo`.
- Modify `src/components/GitlabProjectInfo.tsx` — render stat pills.
- Tests: `src/components/formatBytes.test.ts`, `src/gitlab/client.test.ts`, `src/gitlab/fetchers.test.ts`, `src/components/GitlabProjectInfo.test.tsx`.
- Docs: `README.md`, example page.

---

## Task 7: `formatBytes` helper

**Files:**
- Create: `src/components/formatBytes.ts`
- Test: `src/components/formatBytes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/formatBytes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { formatBytes } from "./formatBytes.js";

describe("formatBytes", () => {
  it("formats zero and bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });
  it("formats KB, MB, GB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(4_404_019)).toBe("4.2 MB");
    expect(formatBytes(2_147_483_648)).toBe("2 GB");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/formatBytes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `formatBytes`**

Create `src/components/formatBytes.ts`:

```ts
/** Humanize a byte count: 1536 -> "1.5 KB", 4.4e6 -> "4.2 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${parseFloat(value.toFixed(1))} ${units[unit]}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/formatBytes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/formatBytes.ts src/components/formatBytes.test.ts
git commit -m "feat: add formatBytes helper"
```

---

## Task 8: `getProject` statistics option + `getContributorsCount`

**Files:**
- Modify: `src/gitlab/client.ts`
- Test: `src/gitlab/client.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/gitlab/client.test.ts`, add a `contributorsAllMock = vi.fn();` at the top, wire it into the mocked Gitlab object as `Repositories: { allContributors: contributorsAllMock }`, and reset it in `beforeEach`. Add:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/gitlab/client.test.ts -t "getProject forwards|getContributorsCount"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/gitlab/client.ts`, change `getProject` to accept options and add `getContributorsCount`:

```ts
  async getProject(project: ProjectRef, opts?: { statistics?: boolean }): Promise<any> {
    return opts ? this.api.Projects.show(project, opts) : this.api.Projects.show(project);
  }

  async getContributorsCount(project: ProjectRef): Promise<number | undefined> {
    const res: any = await this.api.Repositories.allContributors(project, {
      showExpanded: true,
      perPage: 1,
      maxPages: 1,
    });
    const total = res?.paginationInfo?.total;
    return typeof total === "number" ? total : undefined;
  }
```

Note: passing `undefined` options to `Projects.show` would change the call signature in the "omits options by default" test — that is why the ternary calls `show(project)` with no second arg when `opts` is undefined.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/client.test.ts`
Expected: PASS (all client tests — the existing `getProject` callers still pass one arg).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/client.ts src/gitlab/client.test.ts
git commit -m "feat: add statistics option and getContributorsCount to client"
```

---

## Task 9: Map stats in `fetchProjectInfo`

**Files:**
- Modify: `src/gitlab/types.ts` (stat fields)
- Modify: `src/gitlab/fetchers.ts`
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Extend `ProjectInfoData`**

In `src/gitlab/types.ts`, add to `ProjectInfoData` (after the section fields from Task 3):

```ts
  openIssuesCount?: number;
  commitCount?: number;
  repositorySize?: number;
  contributorsCount?: number;
```

- [ ] **Step 2: Write the failing tests**

In `src/gitlab/fetchers.test.ts`, add inside `describe("fetchProjectInfo", ...)`:

```ts
it("maps statistics, open issues, and contributors count", async () => {
  const client = {
    getProject: vi.fn(async () => ({
      id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
      star_count: 3, forks_count: 1, topics: [], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      issues_enabled: true, open_issues_count: 12,
      statistics: { commit_count: 1200, repository_size: 4404019 },
    })),
    getContributorsCount: vi.fn(async () => 8),
  };
  const c = ctx(client);
  const data = await fetchProjectInfo(c, { project: "g/r" });
  expect(client.getProject).toHaveBeenCalledWith("g/r", { statistics: true });
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
```

Also update the two existing `fetchProjectInfo` tests that assert `expect(client.getProject).toHaveBeenCalledWith("g/r")` — they must now expect `toHaveBeenCalledWith("g/r", { statistics: true })`. Those two fakes have no `getContributorsCount`; add `getContributorsCount: vi.fn(async () => undefined)` to their `client` objects.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t "fetchProjectInfo"`
Expected: FAIL — stats not mapped; `getProject` called without options.

- [ ] **Step 4: Implement stat mapping**

In `src/gitlab/fetchers.ts`, inside the `fetchProjectInfo` memo closure, change the project fetch to request statistics and add the stat mapping. Update the `getProject` call:

```ts
    const p = await ctx.client.getProject(attrs.project as string | number, { statistics: true });
```

Compute the contributors count best-effort (never throws) alongside the section fetches:

```ts
    const contributorsCount = await ctx.client
      .getContributorsCount(attrs.project as string | number)
      .catch(() => undefined);
```

After building `base` (before the `if (releases)` lines), attach the stats:

```ts
    if (typeof p.statistics?.commit_count === "number") base.commitCount = p.statistics.commit_count;
    if (typeof p.statistics?.repository_size === "number") base.repositorySize = p.statistics.repository_size;
    if (p.issues_enabled && typeof p.open_issues_count === "number") base.openIssuesCount = p.open_issues_count;
    if (typeof contributorsCount === "number") base.contributorsCount = contributorsCount;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: PASS (including the two updated existing tests).

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/types.ts src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: map commit/contributor/issue/size stats in fetchProjectInfo"
```

---

## Task 10: Render stat pills in the component

**Files:**
- Modify: `src/components/GitlabProjectInfo.tsx`
- Test: `src/components/GitlabProjectInfo.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/GitlabProjectInfo.test.tsx`, add:

```ts
it("appends stat pills when their data is present", () => {
  render(<GitlabProjectInfo data={{ ...data,
    commitCount: 1200, contributorsCount: 8, openIssuesCount: 12, repositorySize: 4404019,
  } as any} />);
  expect(screen.getByText(/1.2k commits/)).toBeInTheDocument();
  expect(screen.getByText(/8 contributors/)).toBeInTheDocument();
  expect(screen.getByText(/12 issues/)).toBeInTheDocument();
  expect(screen.getByText(/4.2 MB/)).toBeInTheDocument();
});

it("omits stat pills whose data is absent", () => {
  render(<GitlabProjectInfo data={data as any} />);
  expect(screen.queryByText(/commits/)).not.toBeInTheDocument();
  expect(screen.queryByText(/contributors/)).not.toBeInTheDocument();
});

it("hides all stats including new pills when showStats is false", () => {
  render(<GitlabProjectInfo showStats={false} data={{ ...data, commitCount: 1200 } as any} />);
  expect(screen.queryByText(/commits/)).not.toBeInTheDocument();
  expect(screen.queryByText(/★/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx -t "stat pills|showStats is false"`
Expected: FAIL.

- [ ] **Step 3: Implement the pills**

In `src/components/GitlabProjectInfo.tsx`, add the `formatBytes` import:

```tsx
import { formatBytes } from "./formatBytes.js";
```

Inside the `showStats` block, add the new pills after the forks span and before the `updated` span:

```tsx
          <span>⑂ {formatCount(data.forksCount)}</span>
          {typeof data.commitCount === "number" && (
            <span>⎇ {formatCount(data.commitCount)} commits</span>
          )}
          {typeof data.contributorsCount === "number" && (
            <span>👥 {formatCount(data.contributorsCount)} contributors</span>
          )}
          {typeof data.openIssuesCount === "number" && (
            <span>⊙ {formatCount(data.openIssuesCount)} issues</span>
          )}
          {typeof data.repositorySize === "number" && (
            <span>▤ {formatBytes(data.repositorySize)}</span>
          )}
          <span className="gitlab-muted">updated {new Date(data.lastActivityAt).toLocaleDateString()}</span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/GitlabProjectInfo.tsx src/components/GitlabProjectInfo.test.tsx
git commit -m "feat: render extended stat pills in GitlabProjectInfo"
```

---

## Task 11: Documentation (Feature 2) + full verification

**Files:**
- Modify: `README.md`, example page
- Verify: whole test suite + typecheck

- [ ] **Step 1: Document the stats**

In the README and the `GitlabProjectInfo` example page, describe the new stat pills (commits, contributors, open issues, repository size), note they appear automatically when data is available and are still gated by `showStats`, and add the **Reporter+ token** caveat: commits count and repository size require the build-time token to have Reporter access; otherwise those two pills are omitted.

- [ ] **Step 2: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (all files).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: no errors; `dist/` emitted.

- [ ] **Step 4: Commit**

```bash
git add README.md examples/site/docs
git commit -m "docs: document GitlabProjectInfo extended stats"
```

- [ ] **Step 5 (optional but recommended): e2e**

If you touched anything the e2e site exercises, add a `<GitlabProjectInfo … releases={2} commits={3} />` usage to an example page and run:
Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS (slow, ~1 min).

---

## Self-review notes (already reconciled)

- **Spec coverage:** sections (Tasks 1–4), layouts + exports (Task 5), sections docs (Task 6); stats helper (Task 7), client (Task 8), fetcher mapping (Task 9), component pills (Task 10), stats docs + verification (Task 11). Code-lines is intentionally absent (no API).
- **Strict semantics:** section fetches respect `strict` (Task 3); contributors/statistics are best-effort and never throw (Tasks 8–9).
- **Type consistency:** `CommitData` (`shortId/title/webUrl/authorName/createdAt`) is defined in Task 2 and used identically in Tasks 3–5; `getProject(project, { statistics })`, `getContributorsCount`, and the `openIssuesCount/commitCount/repositorySize/contributorsCount` fields are named identically across Tasks 8–10.
- **Existing-test updates:** Task 9 Step 2 explicitly updates the two prior `fetchProjectInfo` tests for the new `getProject` signature.
