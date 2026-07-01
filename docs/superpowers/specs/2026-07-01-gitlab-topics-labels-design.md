# Design: `GitlabTopics` & `GitlabLabels` components

**Date:** 2026-07-01
**Status:** Approved (brainstorming)

## Summary

Two new build-time MDX components that render GitLab **topics** and **labels** as
lists of links. Each item links to the corresponding search/filter view on GitLab.
Both follow the existing pipeline: `registry → fetcher → inject → pure component`.

- `<GitlabTopics>` — renders the instance-wide topic catalog, each topic linking to
  its projects-by-topic explore page, with a small bubble showing how many projects
  use it.
- `<GitlabLabels>` — renders the labels of a project **or** a group, each linking to
  the issues list filtered by that label. Two configurable layouts (list / cards).

Two separate components (rather than one `GitlabList` with a `type` switch) because
the data sources, URLs, and rendering differ enough that separate fetchers/components
are cleaner and match the one-fetcher-per-component convention.

## Attribute surface

### `<GitlabTopics>`

Instance-wide catalog; **no** project/group scope (GitLab has no group-topics
endpoint — the instance `/topics` catalog is the source).

| attr | type | default | notes |
|---|---|---|---|
| `filter` | string | — | JS regex, case-insensitive, matched against the topic **title** |
| `order` | string | `name` | `name` \| `name:asc` \| `name:desc` |
| `limit` | number | all | cap applied after filter + sort |

### `<GitlabLabels>`

Same three attributes, **plus exactly one of** `project` / `group`, **plus** `layout`.

| attr | type | default | notes |
|---|---|---|---|
| `project` | string \| number | — | e.g. `"group/proj"` or numeric id |
| `group` | string \| number | — | e.g. `"my-group"` or numeric id |
| `filter` | string | — | JS regex, case-insensitive, matched against the label **name** |
| `order` | string | `name` | `name` \| `name:asc` \| `name:desc` |
| `limit` | number | all | cap applied after filter + sort |
| `layout` | string | `list` | `list` \| `cards` |

**Validation (build-time errors, following the `readTocMode` precedent):**

- `<GitlabLabels>` requires **exactly one** of `project` / `group`; both or neither
  throws a clear error.
- Invalid `order` value throws.
- Invalid `layout` value throws.
- An invalid `filter` regex throws (surfaced via the standard remark error path:
  aborts the build in `strict` mode, renders the `Fallback` otherwise).

All attribute values remain **static literals** (enforced by `parseAttributes`).

## Domain types (`src/gitlab/types.ts`)

```ts
export interface TopicData {
  name: string;              // slug used in the explore URL
  title: string;             // human-readable display title
  totalProjectsCount: number;// rendered in a small bubble
  webUrl: string;            // /explore/projects/topics/<name>
}

export interface LabelData {
  name: string;
  color: string;             // hex, e.g. "#428BCA"
  textColor: string;         // contrast color from the API (text_color)
  description: string | null;
  webUrl: string;            // issues list filtered by this label
}
```

## Data flow

### Topics

1. `client.getTopics()` → `api.Topics.all({ perPage: 100 })`. The response includes
   `name`, `title`, and `total_projects_count` by default — no extra calls.
2. Fetcher maps to `TopicData`, building
   `webUrl = ${host}/explore/projects/topics/${encodeURIComponent(name)}`.
3. Fetcher applies **filter → sort → limit** in memory, then `memo(...)` caches the
   normalized result.

**Perf note:** on very large instances (e.g. gitlab.com) the topic catalog can be
large. The result is cached on disk (`FileCache` TTL) so repeated builds are cheap.
`filter`/`order`/`limit` are applied after fetch. If this proves too heavy in
practice, a future refinement is to pass a plain-prefix `filter` through the API's
`search` param; out of scope here.

### Labels

1. `client.getProjectLabels(project)` → `api.ProjectLabels.all(project)`
   **or** `client.getGroupLabels(group)` → `api.GroupLabels.all(group)`.
2. **Archived filter:** drop archived labels with `raw.filter(l => l.archived !== true)`.
   Using `!== true` (not `=== false`) keeps this a safe no-op on GitLab versions that
   don't expose an `archived` field on labels.
   **Verification during implementation:** confirm the exact field name/availability
   against the live GitLab labels API; adjust if it differs.
3. **Link base URL** is derived from the API's `web_url` so links are correct even
   when the scope is a numeric id:
   - project scope → `client.getProject(project).web_url` (already cached).
   - group scope → new `client.getGroup(group)` (`api.Groups.show`) → `web_url`.
   - `webUrl = ${webUrl}/-/issues?label_name[]=${encodeURIComponent(name)}`.
4. Fetcher maps to `LabelData` (`color`, `text_color → textColor`, `description`),
   applies **filter → sort → limit**, then `memo(...)` caches.

`layout` does **not** affect the data payload — `description` is fetched regardless
(it is free in the labels response). Layout is purely presentational.

### How `layout` reaches the component

`injectProp` only **pushes** a `data`/`error` attribute onto the JSX node; it never
strips existing attributes. So `layout="cards"` survives remark and arrives at the
component as an ordinary React prop. The fetcher validates the value; the component
reads it directly.

## Client additions (`src/gitlab/client.ts`)

```ts
async getTopics(): Promise<any[]> {
  return this.api.Topics.all({ perPage: 100 });
}
async getProjectLabels(project: ProjectRef): Promise<any[]> {
  return this.api.ProjectLabels.all(project);
}
async getGroupLabels(group: ProjectRef): Promise<any[]> {
  return this.api.GroupLabels.all(group);
}
async getGroup(group: ProjectRef): Promise<any> {
  return this.api.Groups.show(group);
}
```

gitbeaker resource names verified present: `Topics`, `ProjectLabels`, `GroupLabels`,
`Groups`. Responses are snake_case (`total_projects_count`, `text_color`, `web_url`);
normalize to camelCase in the fetchers per convention.

## Fetchers (`src/gitlab/fetchers.ts`)

Two new fetchers plus small shared helpers:

- `readOrder(value)` → `{ field: "name"; dir: "asc" | "desc" }`; throws on invalid.
- `compileFilter(value)` → `(name: string) => boolean` using `new RegExp(value, "i")`;
  throws on an invalid pattern.
- `readLayout(value)` → `"list" | "cards"`; throws on invalid (used by `fetchLabels`
  only for validation).

```ts
export async function fetchTopics(ctx, attrs): Promise<TopicData[]>
export async function fetchLabels(ctx, attrs): Promise<LabelData[]>
```

Sorting: `localeCompare` on the display field (`title` for topics, `name` for
labels), reversed for `desc`. Cache keys include filter/order/limit (and
project|group for labels); `layout` is excluded (does not affect data).

## Registry (`src/remark/registry.ts`)

```ts
GitlabTopics: fetchTopics,
GitlabLabels: fetchLabels,
```

## Components (`src/components/`)

Pure, `error → Fallback; !data → null; else render`.

### `GitlabTopics.tsx`

```tsx
export function GitlabTopics({ data, error }: ComponentPayload<TopicData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className="gitlab-topics">
      {data.map((t) => (
        <li key={t.name}>
          <a className="gitlab-badge" href={t.webUrl}>
            {t.title}
            <span className="gitlab-count-bubble">{t.totalProjectsCount}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
```

### `GitlabLabels.tsx`

Receives `layout` as a surviving prop (default `list`).

```tsx
interface GitlabLabelsProps extends ComponentPayload<LabelData[]> {
  layout?: "list" | "cards";
}

export function GitlabLabels({ data, error, layout = "list" }: GitlabLabelsProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  if (layout === "cards") {
    return (
      <div className="gitlab-label-cards">
        {data.map((l) => (
          <a key={l.name} className="gitlab-label-card" href={l.webUrl}>
            <span className="gitlab-badge gitlab-label"
                  style={{ backgroundColor: l.color, color: l.textColor }}>
              {l.name}
            </span>
            {l.description && <p className="gitlab-label-card-desc">{l.description}</p>}
          </a>
        ))}
      </div>
    );
  }
  return (
    <ul className="gitlab-labels">
      {data.map((l) => (
        <li key={l.name}>
          <a className="gitlab-badge gitlab-label" href={l.webUrl}
             title={l.description ?? undefined}
             style={{ backgroundColor: l.color, color: l.textColor }}>
            {l.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
```

**Styling convention:** existing components use **plain global class names** (e.g.
`gitlab-badge`, `gitlab-card`) and do **not** import a CSS module — styling is left
to the consumer's theme. The new classes (`gitlab-topics`, `gitlab-count-bubble`,
`gitlab-labels`, `gitlab-label`, `gitlab-label-cards`, `gitlab-label-card`,
`gitlab-label-card-desc`) follow the same plain-class approach; no CSS module import
is added.

## Exports

- `src/components/index.ts` — export `GitlabTopics`, `GitlabLabels`.
- `src/index.ts` — export `TopicData`, `LabelData` types.

## Error handling

Unchanged: fetchers throw; the remark transformer centralizes `strict` handling
(throw → abort build, or inject an `error` prop → render `Fallback`). Empty results
render an empty list (consistent with `GitlabIssues`).

## Testing (TDD)

**Fetcher tests** (fake/mocked client):
- Topics: normalization incl. `totalProjectsCount`; filter regex; order asc/desc;
  limit; webUrl construction.
- Labels: project vs group source; archived labels excluded; link base built from
  `web_url` (project and group); filter/order/limit; both/neither scope → error;
  invalid `order`/`layout`/`filter` → error.

**Component tests** (React Testing Library):
- `GitlabTopics`: renders links with correct `href` and count bubble; `error → Fallback`.
- `GitlabLabels`: `list` layout renders colored badge links; `cards` layout renders
  title + description; correct `href`; `layout` defaults to `list`; `error → Fallback`.

## Docs

- README section for both components.
- `examples/site/docs/components/` page for each (also exercised by the slow e2e
  build in `test/e2e/build.test.ts`).

## Out of scope

- Ordering by usage count (explicitly deferred — `order` is name-only).
- Displaying label issue/MR counts.
- Passing `filter` through the API `search` param (client-side regex only).
- A merge-request link variant for labels (issues only).
