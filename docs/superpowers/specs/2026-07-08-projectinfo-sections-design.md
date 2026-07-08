# GitlabProjectInfo: embedded releases / commits / issues sections

**Date:** 2026-07-08
**Status:** Approved design
**Component:** `<GitlabProjectInfo>`

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

## Out of scope

- No standalone `GitlabCommits` component (commits live only inside
  `GitlabProjectInfo`).
- No new pagination ceiling work; each section fetches a single page bounded by
  its `limit` (`maxPages: 1`), consistent with `getReleases` / `getIssues`.
