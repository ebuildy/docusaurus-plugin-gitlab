# GitlabProjectInfo: embedded sections + extended stats

**Date:** 2026-07-08
**Status:** Approved design
**Component:** `<GitlabProjectInfo>`

Two related enhancements to `<GitlabProjectInfo>`:

1. **Embedded sections** — opt-in latest releases / commits / issues rendered
   inside the card, plus a title-link override.
2. **Extended stats** — additional pills (commits, contributors, open issues,
   repository size) appended to the existing stats row when available.

---

# Feature 1 — Embedded releases / commits / issues sections

## Goal

Let authors optionally embed compact, build-time-fetched summaries of a
project's latest releases, commits, and issues directly inside the
`GitlabProjectInfo` card, and let them override the card's title link. Each
section is opt-in via a count attribute, discreet by default, and configurable
to a richer layout.

New MDX attributes on `<GitlabProjectInfo>`:

| Attribute | Type | Default | Effect |
|---|---|---|---|
| `releases` | number | unset | Include latest N releases. Unset/`≤0` ⇒ not fetched, not rendered. |
| `commits` | number | unset | Include latest N commits. Unset/`≤0` ⇒ not fetched, not rendered. |
| `issues` | number | unset | Include latest N issues. Unset/`≤0` ⇒ not fetched, not rendered. |
| `link` | string | `data.webUrl` | Override the card title's `href`. |
| `releasesLayout` | `"list"` \| `"cards"` | `"list"` | Compact one-line list vs richer cards. |
| `commitsLayout` | `"list"` \| `"cards"` | `"list"` | Compact one-line list vs richer rows. |
| `issuesLayout` | `"list"` \| `"cards"` | `"list"` | Compact one-line list vs richer cards. |

Attribute values are static scalar literals only (string/number/boolean), per
the existing `src/remark/attributes.ts` parser — no objects or arrays.

Example:

```mdx
<GitlabProjectInfo project="group/app" releases={3} commits={5} issues={5} link="https://example.com/app" />
<GitlabProjectInfo project="group/app" releases={3} releasesLayout="cards" />
```

## Chosen approach

**Compose existing fetchers.** `fetchProjectInfo` remains the single fetcher
registered for `GitlabProjectInfo`. When a section's count attribute is present
and `> 0`, it awaits the matching fetcher and attaches the result to
`ProjectInfoData`:

- releases → reuse existing `fetchReleases(ctx, { project, limit })`
- issues → reuse existing `fetchIssues(ctx, { project, limit })`
- commits → new `fetchCommits(ctx, { project, limit })` + new client method

Rejected alternatives:

- **Inline everything** in `fetchProjectInfo` — duplicates the
  snake_case→camelCase normalization already living in `fetchReleases` /
  `fetchIssues`.
- **Separate injected props** — the remark plugin injects exactly one `data`
  prop per JSX element, so the sub-data must be nested inside `ProjectInfoData`.

## Data model & fetching

### Types (`src/gitlab/types.ts`)

New `CommitData`:

```ts
export interface CommitData {
  shortId: string;    // e.g. "a79a7f7"
  title: string;
  webUrl: string;     // link to the commit
  authorName: string;
  createdAt: string;  // ISO; rendered as a short/relative date
}
```

`ProjectInfoData` gains three optional fields, populated only when the matching
count attribute is set and `> 0`:

```ts
export interface ProjectInfoData {
  // …existing fields unchanged…
  releases?: ReleaseData[];
  commits?: CommitData[];
  issues?: IssueData[];
}
```

`ReleaseData` and `IssueData` are reused as-is.

### Client (`src/gitlab/client.ts`)

New method mirroring `getReleases` / `getIssues`:

```ts
async getCommits(project: ProjectRef, limit: number): Promise<any[]> {
  const commits = await this.api.Commits.all(project, { perPage: limit, maxPages: 1 });
  return commits.slice(0, limit);
}
```

### Fetcher (`src/gitlab/fetchers.ts`)

- Add `fetchCommits(ctx, attrs)` normalizing gitbeaker commits
  (`short_id`, `title`, `web_url`, `author_name`, `created_at`) →
  `CommitData`, memoized on `commits:${project}:${limit}`.
- Extend `fetchProjectInfo` to read `releases` / `commits` / `issues` as
  numbers. For each present and `> 0`, await the corresponding fetcher (passing
  `limit: N`) and attach the array to the result.
- **No-fetch rule (explicit):** if a count is unset or `≤ 0`, that section's
  fetcher is **not called** — no `getCommits` / releases / issues request is
  made, and the field is left `undefined`.
- Extend the `projectInfo:` cache key to include the three counts
  (e.g. `projectInfo:${project}:r${rN}:c${cN}:i${iN}`) so different configs do
  not collide. `link` and the `*Layout` attributes are presentational and are
  **not** part of the cache key.

## Component rendering (`src/components/GitlabProjectInfo.tsx`)

The three sections render **inside the card, immediately after the
`descriptionHtml` block**, in fixed order: **releases → commits → issues**. A
section renders only if its data array is present and non-empty.

New presentational props read directly from MDX attributes (not from `data`):

- `link?: string` — overrides the title `href`; falls back to `data.webUrl`.
- `releasesLayout?`, `commitsLayout?`, `issuesLayout?` — `"list"` (default) or
  `"cards"`. Invalid literals throw at build time, matching the existing
  `GitlabLabels` layout validation.

Each section has a small heading label ("Releases", "Latest commits",
"Issues").

### Compact (`list`) lines — the discreet default

- **Release:** `tagName` — `name`, linked.
- **Commit:** `shortId` (linked to commit) · `title` · `authorName` · short date.
- **Issue:** `#iid` `title`, linked to `webUrl`.

### Rich (`cards`)

Self-contained renderers inside `GitlabProjectInfo` (per the requirement that
the sections live inside this component):

- Releases and issues render as small stacked cards.
- Commits render as richer rows (SHA + title + author + date).

Shared per-item markup lives in tiny local helpers to avoid duplication between
the two layouts.

## Error handling

- Composed sub-fetches run through the existing `strict` path: in `strict`
  mode a failed releases/commits/issues fetch aborts the build (current
  behavior); in non-strict/dev mode the failing section is omitted and the rest
  of the card still renders.
- A failure of the core project-info fetch still yields the `error` prop →
  `Fallback`, unchanged.
- Invalid `*Layout` literals throw at build time.

## Testing (TDD)

- **Client:** `getCommits` calls `Commits.all` with `perPage`/`maxPages` and
  slices to `limit` (mocked gitbeaker).
- **Fetcher:**
  - `fetchProjectInfo` attaches `releases` / `commits` / `issues` only when the
    count is `> 0`.
  - Asserts **no** client call for a section when its count is unset or `0`.
  - Cache key varies by counts.
  - `fetchCommits` normalizes snake_case → camelCase.
- **Component:**
  - Sections render after the description in order releases → commits → issues.
  - Compact vs `cards` layouts (queries by role/text).
  - `link` overrides the title `href`; default is `data.webUrl`.
  - Empty/absent arrays render nothing.
  - Invalid layout literal throws.

## Documentation

- Update `README` with the new attributes and examples.
- Update the `GitlabProjectInfo` page under
  `examples/site/docs/components/`; the e2e Docusaurus build
  (`test/e2e/build.test.ts`) exercises the render path.

---

# Feature 2 — Extended project stats

## Goal

Enrich the existing `gitlab-stats` row in `GitlabProjectInfo` with more
project metrics, sourced cheaply from the GitLab API. The existing `showStats`
prop still gates the whole row; the extra pills are appended automatically
whenever their data is available. No new opt-in attributes.

Stats added: **commits count**, **contributors count**, **open issues count**,
**repository size**. (Code-lines count was requested but is **not feasible** —
GitLab exposes no lines-of-code API; `repository_size` is bytes-on-disk,
`languages` is percentages, and contributor `additions`/`deletions` are churn,
not current LOC.)

## API feasibility (verified against installed gitbeaker)

| Stat | Source | Cost |
|---|---|---|
| Commits count | `statistics.commit_count` on `Projects.show(project, {statistics:true})` | Free (same call) |
| Repository size | `statistics.repository_size` (bytes) on the same call | Free (same call) |
| Open issues count | `open_issues_count` on the base project object | Free (already fetched) |
| Contributors count | `X-Total` pagination header from `Repositories.allContributors` | 1 cheap request |

**Permission caveat:** the `statistics` object is only returned when the
build-time token has **Reporter+** access. For anonymous/public builds it is
omitted, so `commitCount` / `repositorySize` are `undefined` and their pills
are simply not rendered.

## Data model (`src/gitlab/types.ts`)

`ProjectInfoData` gains four optional, best-effort fields (omitted when
unavailable):

```ts
export interface ProjectInfoData {
  // …existing: starCount, forksCount, lastActivityAt…
  openIssuesCount?: number;    // project.open_issues_count (only when issues_enabled)
  commitCount?: number;        // statistics.commit_count — needs Reporter+ token
  repositorySize?: number;     // statistics.repository_size (bytes) — needs Reporter+ token
  contributorsCount?: number;  // from the contributors endpoint's X-Total header
}
```

## Client (`src/gitlab/client.ts`)

- `getProject(project, opts?)` gains an optional `{ statistics?: boolean }`.
  `fetchProjectInfo` passes `{ statistics: true }`; all other callers
  (readme / file / labels) keep today's behavior — no extra cost or permission
  change elsewhere.
- New `getContributorsCount(project): Promise<number | undefined>`:
  calls `Repositories.allContributors(project, { showExpanded: true, perPage: 1, maxPages: 1 })`
  and returns `paginationInfo.total` (the `X-Total` header). Returns `undefined`
  when the header is absent — no full-list walk.

## Fetcher (`fetchProjectInfo`)

After the project fetch (now with `statistics: true`), map:

- `commitCount` ← `p.statistics?.commit_count` (undefined when statistics withheld)
- `repositorySize` ← `p.statistics?.repository_size` (same)
- `openIssuesCount` ← `p.open_issues_count` only when `p.issues_enabled`
- `contributorsCount` ← `await getContributorsCount(project)`

**All four are best-effort:** any absence or failure leaves the field
`undefined`, renders no pill, and **never aborts the build — even in `strict`
mode** (they are supplementary, unlike the Feature 1 section fetches, which
respect `strict`). The contributors call is wrapped so a failure degrades to
`undefined`. No cache-key change — these are deterministic per project and
already covered by the existing `projectInfo:` key.

## Component (`src/components/GitlabProjectInfo.tsx`)

Inside the existing `showStats` block, append one pill per **defined** field:

- Commits — `formatCount(commitCount)` (e.g. "1.2k commits")
- Contributors — `formatCount(contributorsCount)` (e.g. "8 contributors")
- Open issues — `formatCount(openIssuesCount)` (e.g. "12 issues")
- Repository size — new `formatBytes(repositorySize)` helper (e.g. "4.2 MB")

`showStats={false}` still hides the entire row. Existing star / fork / updated
pills are unchanged.

## Testing (TDD)

- **Client:** `getProject` forwards `statistics: true` when requested;
  `getContributorsCount` returns the pagination `total` and `undefined` when the
  header is absent.
- **Fetcher:** maps all four fields; omits `commitCount`/`repositorySize` when
  `statistics` is absent; omits `openIssuesCount` when issues disabled; a
  contributors-fetch failure yields `undefined` and does **not** throw (even in
  strict mode).
- **Component:** each pill renders only when its value is defined; `formatBytes`
  formatting (bytes → KB/MB/GB); `showStats={false}` hides the row.
- **`formatBytes`:** unit-tested directly (0, bytes, KB, MB, GB boundaries).

## Documentation

- Update the `GitlabProjectInfo` README section and the
  `examples/site/docs/components/` page to describe the new stat pills and the
  Reporter+ token requirement for commits/size.

---

# Out of scope (both features)

- No standalone `GitlabCommits` component (commits live only inside
  `GitlabProjectInfo`).
- No new pagination ceiling work for the sections; each fetches a single page
  bounded by its `limit` (`maxPages: 1`), consistent with `getReleases` /
  `getIssues`.
- No code-lines-count stat (no GitLab API for LOC).
- No new opt-in attributes for stats; visibility is governed by `showStats`
  plus data availability.
