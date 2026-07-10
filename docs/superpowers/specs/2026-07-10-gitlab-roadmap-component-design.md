# Design: `<GitlabRoadmap>` component

**Status:** Approved (design phase)
**Date:** 2026-07-10
**Pipeline:** 3 — `<Gitlab*>` JSX components (remark). See [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md).

## Summary

A new pipeline-3 component that embeds a GitLab **roadmap** — a timeline of
group **epics** or **milestones** — into a Docusaurus page. Like every other
component in this package, all data is fetched at build time and baked into
static HTML; the browser holds no token and makes no GitLab calls.

The component renders in one of two layouts:

- **`gantt`** (default) — horizontal bars on a time axis; scrolls sideways.
- **`timeline`** — a vertical spine of stacked cards; scrolls down only. Suited
  to narrow docs columns and mobile.

Because a static site is built once, there is **no "today" marker** — it would
be frozen at build time and go stale. Rendered content is **title + dates +
labels only**; no markdown descriptions are rendered, so this component never
touches `dangerouslySetInnerHTML` and stays clear of the XSS surface.

## Data source

GitLab's real roadmap renders **group epics** (Premium/Ultimate, group-level;
the Epics REST API is deprecated in 17.0 in favor of Work Items but still
functions via gitbeaker). **Milestones** carry the same start/due dates, are
available on the free tier, and exist at both project and group level.

The component therefore takes a **`source` prop** with two fetch paths:

- `source="epics"` → `GET /groups/:id/epics` (requires `group`).
- `source="milestones"` → group or project milestones (exactly one of
  `group`/`project`).

## Props API

All attributes are **static literals** (rejected otherwise in
`src/remark/attributes.ts`), so data is fetched deterministically at build time.

| Prop | Values | Default | Notes |
|---|---|---|---|
| `source` | `"epics"` \| `"milestones"` | `"epics"` | Chooses the fetch path |
| `group` | group path/id | — | Required for `epics`; one of `group`/`project` for `milestones` |
| `project` | project path/id | — | `milestones` only |
| `layout` | `"gantt"` \| `"timeline"` | `"gantt"` | Horizontal bars vs. vertical spine |
| `scale` | `"quarters"` \| `"months"` \| `"weeks"` | *auto* | Auto-selected from date span; prop overrides |
| `state` | `"opened"` \| `"closed"` \| `"all"` | `"opened"` | Normalized across epics/milestones |
| `labels` | comma-separated | — | Label filter (epics: API-side; milestones: client-side) |
| `from` / `to` | `YYYY-MM-DD` | *derived* | Explicit window; else min/max of item dates |
| `limit` | number | `50` | Capped at the 500 ceiling used by topics/labels |
| `order` | `"start"` \| `"due"` \| `"title"` | `"start"` | Sort key |
| `groupBy` | `"none"` \| `"label"` \| `"parent"` | `"none"` | `"parent"` = epic parent; renders section headings |
| `colorBy` | `"source"` \| `"label"` \| `"state"` | `"source"` | `source` = epic's own `color`; milestones fall back to `state` |
| `showProgress` | boolean | `true` | Progress fill overlay; epics only (milestones ignore) |
| `showLabels` | boolean | `false` | Inline label chips, reusing `src/components/scopedLabel.ts` |

### Validation rules

- `epics` without `group` → error.
- `milestones` with neither or both of `group`/`project` → error.
- Non-literal / unknown enum values → error with the same message style as the
  existing `readOrder` / `readLayout` helpers in `fetchers.ts`.

## Visual treatment (confirmed via mockups)

- **Progress** renders as a darker fill inside a lighter bar (Gantt) / a small
  meter on the card (timeline). Not a "60%" text.
- **Labels** render as inline colored chips next to the title when `showLabels`.
- **Grouped sections** render a heading per group; ungrouped output is a single
  unnamed group.
- **No "today" marker** (static build; see Summary).

## Architecture

Standard pipeline-3 loop (`remark/index.ts` → `registry.ts` → fetcher →
`data` prop → pure component). Three new source areas:

### 1. Domain types — `src/gitlab/types.ts`

```ts
interface LabelRef { name: string; color: string; textColor: string; }

interface RoadmapItemData {
  id: number;
  iid: number;
  title: string;
  state: "opened" | "closed";
  startDate: string | null;   // YYYY-MM-DD
  dueDate: string | null;
  webUrl: string;
  color?: string;             // epic color; absent for milestones
  progress?: number | null;   // 0..100; epics only
  parentId?: number | null;
  parentTitle?: string | null;
  labels: LabelRef[];
}

// Fully positioned model the component renders — no geometry math in React.
interface ScaleTick { label: string; offsetPct: number; }
interface RoadmapPositionedItem extends RoadmapItemData {
  offsetPct: number;          // bar left edge, 0..100 within [rangeStart,rangeEnd]
  widthPct: number;           // bar width, >0
}
interface RoadmapGroup { key: string; title: string | null; items: RoadmapPositionedItem[]; }
interface RoadmapData {
  source: "epics" | "milestones";
  scale: "quarters" | "months" | "weeks";
  rangeStart: string;         // YYYY-MM-DD
  rangeEnd: string;
  ticks: ScaleTick[];
  groups: RoadmapGroup[];
}
```

### 2. Geometry — `src/gitlab/roadmap.ts` (new, pure, no network)

Owns all timeline math so the React components are dumb renderers and the logic
is unit-testable in isolation:

- **Scale selection:** span ≤ ~3 months → `weeks`; ≤ ~1 year → `months`; else
  `quarters`. Overridden by the `scale` prop.
- **Window:** `[from, to]` if given, else `[min(startDate), max(dueDate)]` across
  items, snapped outward to the scale boundary.
- **Positioning:** each item → `offsetPct` / `widthPct` within the window.
  Items with only one date are clamped to a half-open bar within range; items
  with neither date are dropped upstream.
- **Ticks:** boundary ticks + labels for the chosen scale.
- **Grouping:** partition into `RoadmapGroup[]` by `groupBy` (`none` → one
  unnamed group; `label` → one group per label; `parent` → by `parentTitle`).

### 3. Client — `src/gitlab/client.ts`

New thin gitbeaker wrappers, snake_case passthrough (normalized in the fetcher):

- `getGroupEpics(group, { state, labels, orderBy, sort, perPage, maxPages })` → `Epics.all`
- `getGroupMilestones(group, opts)` → `GroupMilestones.all`
- `getProjectMilestones(project, opts)` → `ProjectMilestones.all`

Pagination is bounded by the existing 500-item ceiling (`perPage` 100 ×
`maxPages` 5) — do not raise it.

### 4. Fetcher — `src/gitlab/fetchers.ts`

`fetchRoadmap(ctx, attrs)`:

1. Validate scope + enum literals (reuse the `readOrder`/`readLayout` error
   style).
2. Fetch raw via the source path; normalize snake_case → `RoadmapItemData`:
   - milestone `state` `active`/`closed` → `opened`/`closed`;
   - epic `color`, `parent_id` → `parentId`, resolve `parentTitle` from the
     fetched set when available;
   - label names → `LabelRef` by resolving colors against the group/project
     labels (reuse `getGroupLabels`/`getProjectLabels`); unknown labels get a
     neutral default color.
3. Drop items with neither `startDate` nor `dueDate`.
4. Call `roadmap.ts` to select scale, compute window, position items, and group.
5. Wrap in `memo(...)`. **Cache key** includes `source`, scope (`group`/
   `project`), `state`, `labels`, `from`, `to`, `scale`, `order`, `groupBy`,
   `limit`. `colorBy`, `showLabels`, and `layout` are presentational (read by the
   component) and are **not** in the key.

### 5. Components — `src/components/`

- `GitlabRoadmap.tsx` — dispatches on `layout` → `RoadmapGantt` / `RoadmapTimeline`.
  Both consume the same `RoadmapData`. Shared shape: `error → Fallback;
  no data → null; else render`. Pure — no fetching, no hooks, no side effects.
- `RoadmapGantt.tsx` — scale header from `ticks`; per group a heading + rows of
  positioned bars; progress fill; inline label chips.
- `RoadmapTimeline.tsx` — vertical spine; per group a heading + stacked cards
  (title, date range, progress meter, labels).
- Styles in `src/components/styles.module.css` (typed via `src/css.d.ts`).
- `colorBy` resolves the bar/card tint: `source` → `item.color` (fallback to a
  state color when absent), `label` → first label color, `state` → open/closed
  palette.

### 6. Registry & exports

- `src/remark/registry.ts`: `GitlabRoadmap: fetchRoadmap`.
- `src/components/index.ts`: export `GitlabRoadmap`.
- `src/index.ts`: export the `RoadmapData` type.

## Error handling

Honors the `strict` option like every pipeline: a tier `403` (epics on free
tier), a bad scope, or an empty result **throws and aborts the build** in strict
mode, and **degrades to `<Fallback>`** otherwise. No new error channel.

## Testing (TDD)

- **`roadmap.test.ts`** (geometry, pure): scale-threshold selection, window
  derivation + boundary snapping, positioning math, single-date clamping,
  grouping partitions. The bulk of the logic lives here.
- **`fetchers` roadmap tests** (fake client): epics + milestones normalization,
  state mapping, label-color resolution, scope validation, `strict` degrade path,
  cache-key stability.
- **Component tests** (React Testing Library) for both layouts: queries by
  role/text — group headings, item titles/links, progress fill present when
  `showProgress`, label chips when `showLabels`, `error → Fallback`,
  `no data → null`.
- No new e2e wiring beyond an example page; run `test/e2e/build.test.ts`
  explicitly if the pipeline is touched.

## Docs

- README: a `<GitlabRoadmap>` section with prop table + examples.
- `examples/site/docs/components/roadmap.md`: live example pages (both layouts,
  both sources).

## Non-goals (YAGNI)

- No "today" marker (static build).
- No markdown/description rendering (title-only roadmap).
- No Work Items API migration (Epics API still works via gitbeaker; revisit if
  it is removed).
- No interactive expand/collapse of child epics (static HTML; grouping headings
  cover the hierarchy need).
- No raising the 500-item fetch ceiling.
