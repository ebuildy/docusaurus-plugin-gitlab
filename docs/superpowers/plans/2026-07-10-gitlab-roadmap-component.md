# GitlabRoadmap Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `<GitlabRoadmap>` pipeline-3 component that renders GitLab group **epics** or **milestones** on a build-time timeline, in either a horizontal Gantt or a vertical timeline layout.

**Architecture:** Follows the existing pipeline-3 loop (`remark/index.ts` → `registry.ts` → fetcher → `data` prop → pure component). All timeline geometry (scale selection, positioning, ticks, grouping) lives in a new pure module `src/gitlab/roadmap.ts` computed at build time, so the React components are dumb renderers. Two thin gitbeaker client methods add the epics/milestones fetch paths.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), `@gitbeaker/rest`, React (SSR), Vitest + React Testing Library, CSS modules.

**Design spec:** [`../specs/2026-07-10-gitlab-roadmap-component-design.md`](../specs/2026-07-10-gitlab-roadmap-component-design.md)

---

## Conventions for every task

- **ESM imports** inside `src/` carry explicit `.js` extensions (e.g. `import { buildRoadmap } from "./roadmap.js"`).
- **TDD:** write the failing test first, watch it fail, implement, watch it pass, commit.
- **Commits are GPG-signed automatically** (`commit.gpgsign=true`). If a commit is unsigned, re-run with `git commit -S`. Verify with `git log -1 --format="%G?"` → expect `G`.
- Run one test file with `npx vitest run <path>`. Run the whole suite with `npm run test`. Typecheck with `npm run typecheck`.
- Do **not** run the slow e2e (`test/e2e/build.test.ts`) per task; it runs once at the end (Task 14).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `src/gitlab/types.ts` (modify) | Add roadmap domain types | 1 |
| `src/gitlab/roadmap.ts` (create) | Pure geometry: scale, window, positioning, ticks, grouping, `buildRoadmap` | 2 |
| `src/gitlab/roadmap.test.ts` (create) | Unit tests for the geometry module | 2 |
| `src/gitlab/client.ts` (modify) | `getGroupEpics`, `getGroupMilestones`, `getProjectMilestones` | 3 |
| `src/gitlab/client.test.ts` (modify) | Tests for the three new client methods | 3 |
| `src/gitlab/fetchers.ts` (modify) | `fetchRoadmap` — normalize + validate + `buildRoadmap` + memo | 4, 5 |
| `src/gitlab/fetchers.test.ts` (modify) | Fetcher tests (epics, milestones, degrade, cache key) | 4, 5 |
| `src/remark/registry.ts` (modify) | `GitlabRoadmap: fetchRoadmap` | 6 |
| `src/components/GitlabRoadmap.tsx` (create) | Layout dispatcher | 7 |
| `src/components/RoadmapGantt.tsx` (create) | Horizontal bars | 8 |
| `src/components/RoadmapTimeline.tsx` (create) | Vertical spine | 9 |
| `src/components/roadmapColor.ts` (create) | `colorBy` tint resolver (shared by both layouts) | 7 |
| `src/components/styles.module.css` (modify) | Roadmap styles | 8, 9 |
| `src/components/index.ts` + `src/index.ts` (modify) | Exports | 10 |
| `README.md` + `examples/site/docs/components/roadmap.md` | Docs + live examples | 11 |

---

## Task 1: Domain types

**Files:**
- Modify: `src/gitlab/types.ts` (append)

- [ ] **Step 1: Add the roadmap types**

Append to `src/gitlab/types.ts`:

```ts
/** A GitLab label reduced to what the roadmap renders. */
export interface LabelRef {
  name: string;
  color: string;
  textColor: string;
}

export type RoadmapSource = "epics" | "milestones";
export type RoadmapState = "opened" | "closed";
export type RoadmapScale = "quarters" | "months" | "weeks";

/** One epic/milestone normalized from the GitLab API. */
export interface RoadmapItemData {
  id: number;
  iid: number;
  title: string;
  state: RoadmapState;
  /** ISO `YYYY-MM-DD`, or null when the source has no such date. */
  startDate: string | null;
  dueDate: string | null;
  webUrl: string;
  /** Epic color (e.g. `#1f75cb`); absent for milestones. */
  color?: string;
  /** Completion 0..100; epics only, null when not derivable. */
  progress?: number | null;
  parentId?: number | null;
  parentTitle?: string | null;
  labels: LabelRef[];
}

/** An item after geometry: same fields plus its bar placement. */
export interface RoadmapPositionedItem extends RoadmapItemData {
  /** Bar left edge as a percentage of the timeline window (0..100). */
  offsetPct: number;
  /** Bar width as a percentage of the window (>0). */
  widthPct: number;
}

export interface ScaleTick {
  label: string;
  /** Tick position as a percentage of the window (0..100). */
  offsetPct: number;
}

export interface RoadmapGroup {
  key: string;
  /** Section heading; null for the single ungrouped bucket. */
  title: string | null;
  items: RoadmapPositionedItem[];
}

/** The fully positioned model the component renders — no math in React. */
export interface RoadmapData {
  source: RoadmapSource;
  scale: RoadmapScale;
  rangeStart: string; // ISO YYYY-MM-DD
  rangeEnd: string;
  ticks: ScaleTick[];
  groups: RoadmapGroup[];
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (types are additive, nothing consumes them yet).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/types.ts
git commit -m "feat: add roadmap domain types"
```

---

## Task 2: Geometry module (`roadmap.ts`)

This is the bulk of the logic and is pure (no network). Build it test-first as one cohesive module.

**Files:**
- Create: `src/gitlab/roadmap.ts`
- Test: `src/gitlab/roadmap.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `src/gitlab/roadmap.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  selectScale,
  positionItem,
  buildTicks,
  groupItems,
  buildRoadmap,
} from "./roadmap";
import type { RoadmapItemData, RoadmapPositionedItem } from "./types";

function item(partial: Partial<RoadmapItemData>): RoadmapItemData {
  return {
    id: 1, iid: 1, title: "X", state: "opened",
    startDate: null, dueDate: null, webUrl: "https://x", labels: [],
    ...partial,
  };
}

describe("selectScale", () => {
  it("picks weeks for a short span (<= 92 days)", () => {
    expect(selectScale("2026-01-01", "2026-02-01")).toBe("weeks");
  });
  it("picks months for a mid span (<= 366 days)", () => {
    expect(selectScale("2026-01-01", "2026-07-01")).toBe("months");
  });
  it("picks quarters for a long span (> 366 days)", () => {
    expect(selectScale("2026-01-01", "2028-06-01")).toBe("quarters");
  });
});

describe("positionItem", () => {
  it("positions a bar as a percentage of the window", () => {
    const p = positionItem(
      item({ startDate: "2026-01-01", dueDate: "2026-01-06" }),
      "2026-01-01",
      "2026-01-11",
    );
    expect(p.offsetPct).toBe(0);
    expect(p.widthPct).toBe(50);
  });
  it("clamps a bar that starts before the window and keeps a minimum width", () => {
    const p = positionItem(
      item({ dueDate: "2026-01-02" }), // start falls back to due → zero-length
      "2026-01-01",
      "2026-01-11",
    );
    expect(p.offsetPct).toBeGreaterThanOrEqual(0);
    expect(p.widthPct).toBeGreaterThan(0);
    expect(p.offsetPct + p.widthPct).toBeLessThanOrEqual(100);
  });
});

describe("buildTicks", () => {
  it("emits one tick per month across the window", () => {
    const ticks = buildTicks("2026-01-01", "2026-04-01", "months");
    expect(ticks.map((t) => t.label)).toEqual(["Jan", "Feb", "Mar"]);
    expect(ticks[0].offsetPct).toBe(0);
  });
});

describe("groupItems", () => {
  const positioned = (name: string, parent: string | null): RoadmapPositionedItem => ({
    ...item({ title: name, parentTitle: parent, labels: [] }),
    offsetPct: 0, widthPct: 10,
  });
  it("returns a single unnamed group when groupBy is none", () => {
    const groups = groupItems([positioned("a", null)], "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBeNull();
  });
  it("splits into one section per parent title when groupBy is parent", () => {
    const groups = groupItems(
      [positioned("a", "Platform"), positioned("b", "Growth"), positioned("c", null)],
      "parent",
    );
    expect(groups.map((g) => g.title).sort()).toEqual(["(no parent)", "Growth", "Platform"]);
  });
});

describe("buildRoadmap", () => {
  it("drops undated items, sorts, positions, and wraps in RoadmapData", () => {
    const data = buildRoadmap(
      [
        item({ id: 1, title: "late", startDate: "2026-06-01", dueDate: "2026-08-01" }),
        item({ id: 2, title: "early", startDate: "2026-01-01", dueDate: "2026-03-01" }),
        item({ id: 3, title: "undated" }),
      ],
      { source: "epics", order: "start", groupBy: "none" },
    );
    expect(data.source).toBe("epics");
    expect(data.groups[0].items.map((i) => i.title)).toEqual(["early", "late"]);
    expect(data.groups[0].items).toHaveLength(2); // undated dropped
    expect(data.rangeStart <= "2026-01-01").toBe(true);
    expect(data.ticks.length).toBeGreaterThan(0);
  });

  it("honors an explicit scale override and window", () => {
    const data = buildRoadmap(
      [item({ id: 1, title: "a", startDate: "2026-02-01", dueDate: "2026-03-01" })],
      { source: "epics", order: "start", groupBy: "none", scale: "weeks", from: "2026-01-01", to: "2026-04-01" },
    );
    expect(data.scale).toBe("weeks");
    expect(data.rangeStart).toBe("2026-01-01");
    expect(data.rangeEnd).toBe("2026-04-01");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/gitlab/roadmap.test.ts`
Expected: FAIL — `Failed to resolve import "./roadmap"`.

- [ ] **Step 3: Implement the module**

Create `src/gitlab/roadmap.ts`:

```ts
import type {
  RoadmapData,
  RoadmapGroup,
  RoadmapItemData,
  RoadmapPositionedItem,
  RoadmapScale,
  RoadmapSource,
  ScaleTick,
} from "./types.js";

const MS_PER_DAY = 86_400_000;
const MIN_WIDTH_PCT = 1; // keep zero-length/point items visible
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function spanDays(startISO: string, endISO: string): number {
  return (parseDay(endISO) - parseDay(startISO)) / MS_PER_DAY;
}

/** Round a timestamp down to the start of its scale unit (Monday / 1st / quarter). */
function snapDown(ms: number, scale: RoadmapScale): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (scale === "weeks") {
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const backToMonday = day === 0 ? 6 : day - 1;
    return ms - backToMonday * MS_PER_DAY;
  }
  if (scale === "months") return Date.UTC(y, m, 1);
  return Date.UTC(y, Math.floor(m / 3) * 3, 1); // quarters
}

/** Advance a boundary timestamp by exactly one scale unit. */
function advance(ms: number, scale: RoadmapScale): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (scale === "weeks") return ms + 7 * MS_PER_DAY;
  if (scale === "months") return Date.UTC(y, m + 1, 1);
  return Date.UTC(y, m + 3, 1); // quarters
}

/** Round a timestamp up to the next scale boundary (unchanged if already on one). */
function snapUp(ms: number, scale: RoadmapScale): number {
  const down = snapDown(ms, scale);
  return down === ms ? ms : advance(down, scale);
}

export function selectScale(startISO: string, endISO: string): RoadmapScale {
  const days = spanDays(startISO, endISO);
  if (days <= 92) return "weeks";
  if (days <= 366) return "months";
  return "quarters";
}

/** Raw min-start / max-due across items (falling back to the other date). */
function rawBounds(items: RoadmapItemData[]): { startISO: string; endISO: string } {
  const starts = items.map((i) => i.startDate ?? i.dueDate!).filter(Boolean);
  const ends = items.map((i) => i.dueDate ?? i.startDate!).filter(Boolean);
  const startMs = Math.min(...starts.map(parseDay));
  const endMs = Math.max(...ends.map(parseDay));
  return { startISO: toISODate(startMs), endISO: toISODate(endMs) };
}

function deriveWindow(
  items: RoadmapItemData[],
  scale: RoadmapScale,
  from: string | undefined,
  to: string | undefined,
): { rangeStart: string; rangeEnd: string } {
  const raw = rawBounds(items);
  const startMs = from ? parseDay(from) : snapDown(parseDay(raw.startISO), scale);
  let endMs = to ? parseDay(to) : snapUp(parseDay(raw.endISO), scale);
  if (endMs <= startMs) endMs = advance(startMs, scale); // guarantee a positive window
  return { rangeStart: toISODate(startMs), rangeEnd: toISODate(endMs) };
}

export function positionItem(
  it: RoadmapItemData,
  rangeStart: string,
  rangeEnd: string,
): { offsetPct: number; widthPct: number } {
  const s = parseDay(it.startDate ?? it.dueDate!);
  const e = parseDay(it.dueDate ?? it.startDate!);
  const total = parseDay(rangeEnd) - parseDay(rangeStart);
  const offsetPct = Math.min(Math.max(((s - parseDay(rangeStart)) / total) * 100, 0), 100);
  const rawWidth = ((e - s) / total) * 100;
  const widthPct = Math.max(Math.min(rawWidth, 100 - offsetPct), MIN_WIDTH_PCT);
  return { offsetPct, widthPct };
}

function tickLabel(ms: number, scale: RoadmapScale): string {
  const d = new Date(ms);
  if (scale === "quarters") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (scale === "weeks") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return MONTHS[d.getUTCMonth()];
}

export function buildTicks(rangeStart: string, rangeEnd: string, scale: RoadmapScale): ScaleTick[] {
  const startMs = parseDay(rangeStart);
  const endMs = parseDay(rangeEnd);
  const total = endMs - startMs;
  const ticks: ScaleTick[] = [];
  for (let cur = startMs; cur < endMs; cur = advance(cur, scale)) {
    ticks.push({ label: tickLabel(cur, scale), offsetPct: ((cur - startMs) / total) * 100 });
  }
  return ticks;
}

export function groupItems(
  items: RoadmapPositionedItem[],
  groupBy: "none" | "label" | "parent",
): RoadmapGroup[] {
  if (groupBy === "none") return [{ key: "all", title: null, items }];
  const map = new Map<string, RoadmapGroup>();
  for (const it of items) {
    const keys =
      groupBy === "label"
        ? it.labels.length
          ? it.labels.map((l) => l.name)
          : ["(no label)"]
        : [it.parentTitle ?? "(no parent)"];
    for (const k of keys) {
      const g = map.get(k) ?? { key: k, title: k, items: [] };
      g.items.push(it);
      map.set(k, g);
    }
  }
  return [...map.values()];
}

function sortItems(items: RoadmapItemData[], order: "start" | "due" | "title"): RoadmapItemData[] {
  const key = (i: RoadmapItemData): string =>
    order === "title" ? i.title : order === "due" ? i.dueDate ?? i.startDate ?? "" : i.startDate ?? i.dueDate ?? "";
  return [...items].sort((a, b) => key(a).localeCompare(key(b)));
}

export interface BuildRoadmapOptions {
  source: RoadmapSource;
  order: "start" | "due" | "title";
  groupBy: "none" | "label" | "parent";
  scale?: RoadmapScale;
  from?: string;
  to?: string;
}

export function buildRoadmap(items: RoadmapItemData[], opts: BuildRoadmapOptions): RoadmapData {
  const dated = items.filter((i) => i.startDate || i.dueDate);
  const sorted = sortItems(dated, opts.order);
  const raw = rawBounds(sorted);
  const scale = opts.scale ?? selectScale(raw.startISO, raw.endISO);
  const { rangeStart, rangeEnd } = deriveWindow(sorted, scale, opts.from, opts.to);
  const positioned: RoadmapPositionedItem[] = sorted.map((i) => ({
    ...i,
    ...positionItem(i, rangeStart, rangeEnd),
  }));
  return {
    source: opts.source,
    scale,
    rangeStart,
    rangeEnd,
    ticks: buildTicks(rangeStart, rangeEnd, scale),
    groups: groupItems(positioned, opts.groupBy),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/gitlab/roadmap.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/gitlab/roadmap.ts src/gitlab/roadmap.test.ts
git commit -m "feat: add roadmap timeline geometry module"
```

---

## Task 3: Client methods

**Files:**
- Modify: `src/gitlab/client.ts`
- Test: `src/gitlab/client.test.ts`

- [ ] **Step 1: Add mocks + a failing test**

In `src/gitlab/client.test.ts`, add these mock fns near the other `const ...Mock = vi.fn();` declarations (top of file):

```ts
const epicsAllMock = vi.fn();
const groupMilestonesAllMock = vi.fn();
const projectMilestonesAllMock = vi.fn();
```

Add them to the object returned by the `Gitlab` mock (inside `vi.mock("@gitbeaker/rest", ...)`):

```ts
      Epics: { all: epicsAllMock },
      GroupMilestones: { all: groupMilestonesAllMock },
      ProjectMilestones: { all: projectMilestonesAllMock },
```

Add resets in `beforeEach` alongside the others:

```ts
  epicsAllMock.mockReset();
  groupMilestonesAllMock.mockReset();
  projectMilestonesAllMock.mockReset();
```

Add this test block at the end of the file (before the final closing brace of the top-level `describe`, or as a new `describe`):

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/gitlab/client.test.ts`
Expected: FAIL — `client.getGroupEpics is not a function`.

- [ ] **Step 3: Implement the client methods**

In `src/gitlab/client.ts`, add an epics-query interface next to `IssuesQuery`:

```ts
export interface EpicsQuery {
  state?: string;
  labels?: string;
  orderBy?: string;
  sort?: string;
}
```

Add these methods to the `GitLabClient` class (e.g. after `getGroupProjects`):

```ts
  async getGroupEpics(group: ProjectRef, opts: EpicsQuery = {}): Promise<any[]> {
    return this.api.Epics.all(group, {
      ...(opts.state ? { state: opts.state } : {}),
      ...(opts.labels ? { labels: opts.labels } : {}),
      ...(opts.orderBy ? { orderBy: opts.orderBy } : {}),
      ...(opts.sort ? { sort: opts.sort } : {}),
      perPage: DEFAULT_PER_PAGE,
      maxPages: DEFAULT_MAX_PAGES,
    });
  }

  async getGroupMilestones(group: ProjectRef): Promise<any[]> {
    return this.api.GroupMilestones.all(group, { perPage: DEFAULT_PER_PAGE, maxPages: DEFAULT_MAX_PAGES });
  }

  async getProjectMilestones(project: ProjectRef): Promise<any[]> {
    return this.api.ProjectMilestones.all(project, { perPage: DEFAULT_PER_PAGE, maxPages: DEFAULT_MAX_PAGES });
  }
```

> Note: the first test expects `getGroupEpics` to forward all four filter keys. Because the spread only includes keys when truthy, the test passes all four so every key is present. This keeps real calls from sending empty filters.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/gitlab/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/gitlab/client.ts src/gitlab/client.test.ts
git commit -m "feat: add epics and milestones client methods"
```

---

## Task 4: Fetcher — epics path

**Files:**
- Modify: `src/gitlab/fetchers.ts`
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/gitlab/fetchers.test.ts`, add `fetchRoadmap` to the import from `./fetchers`:

```ts
import { fetchProjectInfo, fetchReleases, fetchIssues, fetchCommits, fetchReadme, fetchFile, fetchTopics, fetchLabels, fetchGroupProjects, fetchRoadmap } from "./fetchers";
```

Add this `describe` block at the end of the file:

```ts
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: FAIL — `fetchRoadmap` is not exported.

- [ ] **Step 3: Implement the epics path**

In `src/gitlab/fetchers.ts`, add imports at the top (extend the existing type import and the roadmap import):

```ts
import { buildRoadmap, type BuildRoadmapOptions } from "./roadmap.js";
```

Add to the existing `import type { ... } from "./types"` block: `LabelRef`, `RoadmapData`, `RoadmapItemData`, `RoadmapScale`.

Add these helpers and the fetcher (near the other fetchers):

```ts
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

function readGroupBy(value: unknown): "none" | "label" | "parent" {
  if (value === undefined || value === "none") return "none";
  if (value === "label" || value === "parent") return value;
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabRoadmap> "groupBy" must be "none", "label", or "parent"; got ${JSON.stringify(value)}.`,
  );
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
  const groupBy = readGroupBy(attrs.groupBy);
  const state = (attrs.state as string) ?? "opened";
  const labels = attrs.labels as string | undefined;
  const from = attrs.from as string | undefined;
  const to = attrs.to as string | undefined;
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
  const orderBy = q.order === "title" ? "title" : q.order === "due" ? "due_date" : "start_date";
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
    parentTitle: e.parent_id != null ? byId.get(e.parent_id)?.title ?? null : null,
    labels: resolveLabels(Array.isArray(e.labels) ? e.labels : [], idx),
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
```

> `fetchMilestoneItems` is defined in Task 5. This task's tests exercise only the epics path; the milestones import will be added next.

- [ ] **Step 4: Temporarily stub the milestone path so the file compiles**

Add a placeholder just below `fetchEpicItems` so `fetchRoadmap` type-checks until Task 5 replaces it:

```ts
async function fetchMilestoneItems(
  _ctx: GitLabContext,
  _scope: { group?: string | number; project?: string | number },
  _state: string,
  _limit: number,
): Promise<RoadmapItemData[]> {
  throw new Error("milestones source not yet implemented");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: PASS (epics tests green; milestone path untested here).

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: add fetchRoadmap epics path"
```

---

## Task 5: Fetcher — milestones path

**Files:**
- Modify: `src/gitlab/fetchers.ts`
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/gitlab/fetchers.test.ts`:

```ts
describe("fetchRoadmap (milestones)", () => {
  const milestones = [
    { id: 1, iid: 5, title: "v1.0", state: "active", start_date: "2026-01-01", due_date: "2026-02-01",
      web_url: "https://gitlab.com/g/r/-/milestones/5" },
    { id: 2, iid: 6, title: "v1.1", state: "closed", start_date: "2026-02-01", due_date: "2026-03-01",
      web_url: "https://gitlab.com/g/r/-/milestones/6" },
  ];

  it("normalizes project milestones and maps active→opened", async () => {
    const client = {
      getProjectMilestones: vi.fn(async () => milestones),
      getProjectLabels: vi.fn(async () => []),
    };
    const c = ctx(client);
    const data = await fetchRoadmap(c, { source: "milestones", project: "g/r" });
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
    const data = await fetchRoadmap(c, { source: "milestones", group: "g" });
    expect(data.groups.flatMap((g) => g.items)).toHaveLength(2);
    expect(client.getGroupMilestones).toHaveBeenCalledWith("g");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: FAIL — throws `milestones source not yet implemented`.

- [ ] **Step 3: Replace the placeholder with the real implementation**

Replace the `fetchMilestoneItems` stub added in Task 4 with:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: PASS (epics + milestones green).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: add fetchRoadmap milestones path"
```

---

## Task 6: Register the component

**Files:**
- Modify: `src/remark/registry.ts`

- [ ] **Step 1: Add the import and registry entry**

In `src/remark/registry.ts`, add `fetchRoadmap` to the import list from `../gitlab/fetchers.js` and add to `COMPONENT_REGISTRY`:

```ts
  GitlabRoadmap: fetchRoadmap,
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/remark/registry.ts
git commit -m "feat: register GitlabRoadmap in the component registry"
```

---

## Task 7: `GitlabRoadmap` dispatcher + color resolver

**Files:**
- Create: `src/components/roadmapColor.ts`
- Create: `src/components/GitlabRoadmap.tsx`
- Test: `src/components/GitlabRoadmap.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/GitlabRoadmap.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabRoadmap } from "./GitlabRoadmap";
import type { RoadmapData } from "./types";

const data: RoadmapData = {
  source: "epics",
  scale: "months",
  rangeStart: "2026-01-01",
  rangeEnd: "2026-04-01",
  ticks: [{ label: "Jan", offsetPct: 0 }, { label: "Feb", offsetPct: 33 }, { label: "Mar", offsetPct: 66 }],
  groups: [
    {
      key: "all", title: null,
      items: [{
        id: 1, iid: 1, title: "Auth", state: "opened", startDate: "2026-01-01", dueDate: "2026-02-01",
        webUrl: "https://x/epics/1", color: "#1f75cb", progress: 60, parentId: null, parentTitle: null,
        labels: [{ name: "backend", color: "#dbeafe", textColor: "#1e40af" }],
        offsetPct: 0, widthPct: 33,
      }],
    },
  ],
};

describe("GitlabRoadmap", () => {
  it("renders the gantt layout by default", () => {
    const { container } = render(<GitlabRoadmap data={data} />);
    expect(container.querySelector(".gitlab-roadmap-gantt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Auth" })).toHaveAttribute("href", "https://x/epics/1");
  });

  it("renders the timeline layout when layout='timeline'", () => {
    const { container } = render(<GitlabRoadmap data={data} layout="timeline" />);
    expect(container.querySelector(".gitlab-roadmap-timeline")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabRoadmap error={{ message: "boom", project: "g" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<GitlabRoadmap />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/GitlabRoadmap.test.tsx`
Expected: FAIL — cannot resolve `./GitlabRoadmap`.

- [ ] **Step 3: Implement the color resolver**

Create `src/components/roadmapColor.ts`:

```ts
import type { RoadmapPositionedItem } from "./types.js";

export type ColorBy = "source" | "label" | "state";

const STATE_COLORS: Record<string, string> = { opened: "#1f75cb", closed: "#6b7280" };

/** Resolve the bar/card tint for an item under the chosen colorBy strategy. */
export function resolveColor(item: RoadmapPositionedItem, colorBy: ColorBy): string {
  if (colorBy === "state") return STATE_COLORS[item.state] ?? STATE_COLORS.opened;
  if (colorBy === "label") return item.labels[0]?.color ?? STATE_COLORS[item.state];
  return item.color ?? STATE_COLORS[item.state]; // "source"
}
```

- [ ] **Step 4: Implement the dispatcher**

Create `src/components/GitlabRoadmap.tsx`:

```tsx
import React from "react";
import { Fallback } from "./Fallback.js";
import { RoadmapGantt } from "./RoadmapGantt.js";
import { RoadmapTimeline } from "./RoadmapTimeline.js";
import type { ColorBy } from "./roadmapColor.js";
import type { ComponentPayload, RoadmapData } from "./types.js";

export interface GitlabRoadmapProps extends ComponentPayload<RoadmapData> {
  layout?: "gantt" | "timeline";
  colorBy?: ColorBy;
  showProgress?: boolean;
  showLabels?: boolean;
}

export function GitlabRoadmap({
  data,
  error,
  layout = "gantt",
  colorBy = "source",
  showProgress = true,
  showLabels = false,
}: GitlabRoadmapProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  const view = { data, colorBy, showProgress, showLabels };
  return layout === "timeline" ? <RoadmapTimeline {...view} /> : <RoadmapGantt {...view} />;
}
```

> `RoadmapGantt` and `RoadmapTimeline` come in Tasks 8 and 9. This step will not compile until those files exist; you will run the test at the end of Task 9. To keep this task self-contained, proceed to Task 8 before running.

- [ ] **Step 5: Commit (partial — layout children follow)**

```bash
git add src/components/roadmapColor.ts src/components/GitlabRoadmap.tsx src/components/GitlabRoadmap.test.tsx
git commit -m "feat: add GitlabRoadmap dispatcher and color resolver"
```

---

## Task 8: `RoadmapGantt` layout

**Files:**
- Create: `src/components/RoadmapGantt.tsx`
- Modify: `src/components/styles.module.css`
- Test: `src/components/RoadmapGantt.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/RoadmapGantt.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RoadmapGantt } from "./RoadmapGantt";
import type { RoadmapData } from "./types";

const data: RoadmapData = {
  source: "epics", scale: "months", rangeStart: "2026-01-01", rangeEnd: "2026-04-01",
  ticks: [{ label: "Jan", offsetPct: 0 }, { label: "Feb", offsetPct: 33 }],
  groups: [{
    key: "Platform", title: "Platform",
    items: [{
      id: 1, iid: 1, title: "Auth", state: "opened", startDate: "2026-01-01", dueDate: "2026-02-01",
      webUrl: "https://x/1", color: "#1f75cb", progress: 60, parentId: null, parentTitle: "Platform",
      labels: [{ name: "backend", color: "#dbeafe", textColor: "#1e40af" }],
      offsetPct: 10, widthPct: 40,
    }],
  }],
};

describe("RoadmapGantt", () => {
  it("renders the scale header, group heading, and a positioned bar", () => {
    const { container } = render(<RoadmapGantt data={data} colorBy="source" showProgress showLabels />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
    const bar = container.querySelector(".gitlab-roadmap-bar") as HTMLElement;
    expect(bar).toHaveStyle({ left: "10%", width: "40%", backgroundColor: "#1f75cb" });
    expect(screen.getByRole("link", { name: /Auth/ })).toHaveAttribute("href", "https://x/1");
  });

  it("renders the progress fill only when showProgress is true", () => {
    const { container, rerender } = render(<RoadmapGantt data={data} colorBy="source" showProgress={false} showLabels={false} />);
    expect(container.querySelector(".gitlab-roadmap-progress")).toBeNull();
    rerender(<RoadmapGantt data={data} colorBy="source" showProgress showLabels={false} />);
    expect(container.querySelector(".gitlab-roadmap-progress")).toHaveStyle({ width: "60%" });
  });

  it("renders label chips only when showLabels is true", () => {
    const { queryByText, rerender } = render(<RoadmapGantt data={data} colorBy="source" showProgress={false} showLabels={false} />);
    expect(queryByText("backend")).toBeNull();
    rerender(<RoadmapGantt data={data} colorBy="source" showProgress={false} showLabels />);
    expect(queryByText("backend")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/RoadmapGantt.test.tsx`
Expected: FAIL — cannot resolve `./RoadmapGantt`.

- [ ] **Step 3: Implement the component**

Create `src/components/RoadmapGantt.tsx`:

```tsx
import React from "react";
import { resolveColor, type ColorBy } from "./roadmapColor.js";
import type { RoadmapData, RoadmapPositionedItem } from "./types.js";

export interface RoadmapViewProps {
  data: RoadmapData;
  colorBy: ColorBy;
  showProgress: boolean;
  showLabels: boolean;
}

function LabelChips({ item }: { item: RoadmapPositionedItem }) {
  return (
    <>
      {item.labels.map((l) => (
        <span key={l.name} className="gitlab-roadmap-label" style={{ backgroundColor: l.color, color: l.textColor }}>
          {l.name}
        </span>
      ))}
    </>
  );
}

export function RoadmapGantt({ data, colorBy, showProgress, showLabels }: RoadmapViewProps) {
  return (
    <div className="gitlab-roadmap gitlab-roadmap-gantt">
      <div className="gitlab-roadmap-scale">
        {data.ticks.map((t) => (
          <span key={t.label + t.offsetPct} className="gitlab-roadmap-tick" style={{ left: `${t.offsetPct}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      {data.groups.map((group) => (
        <div key={group.key} className="gitlab-roadmap-group">
          {group.title && <div className="gitlab-roadmap-group-title">{group.title}</div>}
          {group.items.map((item) => {
            const color = resolveColor(item, colorBy);
            return (
              <div key={item.id} className="gitlab-roadmap-row">
                <div className="gitlab-roadmap-label-col">
                  <a href={item.webUrl}>{item.title}</a>
                  {showLabels && <LabelChips item={item} />}
                </div>
                <div className="gitlab-roadmap-track">
                  <div
                    className="gitlab-roadmap-bar"
                    style={{ left: `${item.offsetPct}%`, width: `${item.widthPct}%`, backgroundColor: color }}
                  >
                    {showProgress && item.progress != null && (
                      <div className="gitlab-roadmap-progress" style={{ width: `${item.progress}%` }} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add styles**

Append to `src/components/styles.module.css` (plain class selectors, matching how other components use `gitlab-*` global classes):

```css
.gitlab-roadmap { font-size: 0.85rem; }
.gitlab-roadmap-gantt { overflow-x: auto; }
.gitlab-roadmap-scale {
  position: relative; height: 1.4rem; margin-left: 12rem;
  border-bottom: 1px solid var(--ifm-color-emphasis-300);
}
.gitlab-roadmap-tick { position: absolute; transform: translateX(-50%); color: var(--ifm-color-emphasis-600); }
.gitlab-roadmap-group-title { font-weight: 600; margin: 0.6rem 0 0.3rem; }
.gitlab-roadmap-row { display: grid; grid-template-columns: 12rem 1fr; gap: 0.5rem; align-items: center; margin: 0.25rem 0; }
.gitlab-roadmap-label-col { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gitlab-roadmap-track { position: relative; height: 1.25rem; background: var(--ifm-color-emphasis-100); border-radius: 4px; }
.gitlab-roadmap-bar { position: absolute; top: 2px; height: calc(100% - 4px); border-radius: 4px; overflow: hidden; opacity: 0.85; }
.gitlab-roadmap-progress { height: 100%; background: rgba(0, 0, 0, 0.35); }
.gitlab-roadmap-label {
  display: inline-block; margin-left: 0.3rem; padding: 0 0.3rem;
  border-radius: 3px; font-size: 0.7rem;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/components/RoadmapGantt.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/RoadmapGantt.tsx src/components/RoadmapGantt.test.tsx src/components/styles.module.css
git commit -m "feat: add RoadmapGantt horizontal layout"
```

---

## Task 9: `RoadmapTimeline` layout

**Files:**
- Create: `src/components/RoadmapTimeline.tsx`
- Modify: `src/components/styles.module.css`
- Test: `src/components/RoadmapTimeline.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/RoadmapTimeline.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RoadmapTimeline } from "./RoadmapTimeline";
import type { RoadmapData } from "./types";

const data: RoadmapData = {
  source: "epics", scale: "months", rangeStart: "2026-01-01", rangeEnd: "2026-04-01", ticks: [],
  groups: [{
    key: "Platform", title: "Platform",
    items: [{
      id: 1, iid: 1, title: "Auth", state: "opened", startDate: "2026-01-01", dueDate: "2026-02-01",
      webUrl: "https://x/1", color: "#1f75cb", progress: 60, parentId: null, parentTitle: "Platform",
      labels: [{ name: "backend", color: "#dbeafe", textColor: "#1e40af" }],
      offsetPct: 0, widthPct: 33,
    }],
  }],
};

describe("RoadmapTimeline", () => {
  it("renders a vertical spine with group heading, card, and date range", () => {
    const { container } = render(<RoadmapTimeline data={data} colorBy="source" showProgress showLabels />);
    expect(container.querySelector(".gitlab-roadmap-timeline")).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Auth/ })).toHaveAttribute("href", "https://x/1");
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
    expect(container.querySelector(".gitlab-roadmap-meter")).toHaveStyle({ width: "60%" });
    expect(screen.getByText("backend")).toBeInTheDocument();
  });

  it("omits meter and labels when toggles are off", () => {
    const { container, queryByText } = render(
      <RoadmapTimeline data={data} colorBy="source" showProgress={false} showLabels={false} />,
    );
    expect(container.querySelector(".gitlab-roadmap-meter")).toBeNull();
    expect(queryByText("backend")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/RoadmapTimeline.test.tsx`
Expected: FAIL — cannot resolve `./RoadmapTimeline`.

- [ ] **Step 3: Implement the component**

Create `src/components/RoadmapTimeline.tsx`:

```tsx
import React from "react";
import { resolveColor } from "./roadmapColor.js";
import type { RoadmapViewProps } from "./RoadmapGantt.js";

function dateRange(start: string | null, due: string | null): string {
  if (start && due) return `${start} → ${due}`;
  return start ?? due ?? "";
}

export function RoadmapTimeline({ data, colorBy, showProgress, showLabels }: RoadmapViewProps) {
  return (
    <div className="gitlab-roadmap gitlab-roadmap-timeline">
      {data.groups.map((group) => (
        <div key={group.key} className="gitlab-roadmap-group">
          {group.title && <div className="gitlab-roadmap-group-title">{group.title}</div>}
          <div className="gitlab-roadmap-spine">
            {group.items.map((item) => {
              const color = resolveColor(item, colorBy);
              return (
                <div key={item.id} className="gitlab-roadmap-node">
                  <span className="gitlab-roadmap-dot" style={{ backgroundColor: color }} />
                  <div className="gitlab-roadmap-card">
                    <a href={item.webUrl}>{item.title}</a>
                    <div className="gitlab-roadmap-dates">{dateRange(item.startDate, item.dueDate)}</div>
                    {showProgress && item.progress != null && (
                      <div className="gitlab-roadmap-meter-track">
                        <div className="gitlab-roadmap-meter" style={{ width: `${item.progress}%`, backgroundColor: color }} />
                      </div>
                    )}
                    {showLabels &&
                      item.labels.map((l) => (
                        <span key={l.name} className="gitlab-roadmap-label" style={{ backgroundColor: l.color, color: l.textColor }}>
                          {l.name}
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Add styles**

Append to `src/components/styles.module.css`:

```css
.gitlab-roadmap-spine { border-left: 2px solid var(--ifm-color-emphasis-300); margin-left: 0.5rem; padding-left: 1rem; }
.gitlab-roadmap-node { position: relative; margin: 0.75rem 0; }
.gitlab-roadmap-dot { position: absolute; left: -1.4rem; top: 0.25rem; width: 0.6rem; height: 0.6rem; border-radius: 50%; }
.gitlab-roadmap-card { display: flex; flex-direction: column; gap: 0.25rem; align-items: flex-start; }
.gitlab-roadmap-dates { color: var(--ifm-color-emphasis-600); font-size: 0.75rem; }
.gitlab-roadmap-meter-track { width: 100%; max-width: 12rem; height: 0.4rem; background: var(--ifm-color-emphasis-200); border-radius: 3px; }
.gitlab-roadmap-meter { height: 100%; border-radius: 3px; }
```

- [ ] **Step 5: Run the timeline, dispatcher, and gantt tests**

Run: `npx vitest run src/components/RoadmapTimeline.test.tsx src/components/GitlabRoadmap.test.tsx src/components/RoadmapGantt.test.tsx`
Expected: PASS (all three, including the Task 7 dispatcher test which now resolves its children).

- [ ] **Step 6: Commit**

```bash
git add src/components/RoadmapTimeline.tsx src/components/RoadmapTimeline.test.tsx src/components/styles.module.css
git commit -m "feat: add RoadmapTimeline vertical layout"
```

---

## Task 10: Exports

**Files:**
- Modify: `src/components/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Export the component**

In `src/components/index.ts`, add:

```ts
export { GitlabRoadmap } from "./GitlabRoadmap.js";
```

And add to the `export type { ... } from "./types.js"` block: `RoadmapData`, `RoadmapItemData`, `LabelRef`.

- [ ] **Step 2: Export the public types**

In `src/index.ts`, add to the `export type { ... } from "./gitlab/types.js"` block: `RoadmapData`, `RoadmapItemData`, `LabelRef`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Run the full suite**

Run: `npm run test`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/index.ts src/index.ts
git commit -m "feat: export GitlabRoadmap and roadmap types"
```

---

## Task 11: Documentation + example page

**Files:**
- Modify: `README.md`
- Create: `examples/site/docs/components/roadmap.md`

- [ ] **Step 1: Add a README section**

Add a `### <GitlabRoadmap>` section to `README.md` (place it alongside the other component sections). Include the full prop table from the design spec and two examples:

```md
### `<GitlabRoadmap>`

Renders a timeline of GitLab **epics** (Premium/Ultimate, group-level) or
**milestones** (free; project or group). All data is fetched at build time.

<GitlabRoadmap source="epics" group="my-group" layout="gantt" showLabels />

<GitlabRoadmap source="milestones" project="my-group/my-project" layout="timeline" />

| Prop | Values | Default | Notes |
|---|---|---|---|
| `source` | `epics` \| `milestones` | `epics` | Fetch path |
| `group` | group path/id | — | Required for epics; one of group/project for milestones |
| `project` | project path/id | — | Milestones only |
| `layout` | `gantt` \| `timeline` | `gantt` | Horizontal bars vs. vertical spine |
| `scale` | `quarters` \| `months` \| `weeks` | auto | Auto from span; prop overrides |
| `state` | `opened` \| `closed` \| `all` | `opened` | |
| `labels` | comma-separated | — | Label filter |
| `from` / `to` | `YYYY-MM-DD` | derived | Explicit window |
| `limit` | number | `50` | Max items (≤ 500) |
| `order` | `start` \| `due` \| `title` | `start` | Sort key |
| `groupBy` | `none` \| `label` \| `parent` | `none` | Section headings |
| `colorBy` | `source` \| `label` \| `state` | `source` | Bar/card tint |
| `showProgress` | boolean | `true` | Epics only |
| `showLabels` | boolean | `false` | Inline label chips |
```

- [ ] **Step 2: Create the example page**

Create `examples/site/docs/components/roadmap.md` following the structure of the sibling pages in that folder (front-matter + a short intro + a couple of live `<GitlabRoadmap ... />` embeds pointing at a public GitLab group/project used by the other example pages).

- [ ] **Step 3: Commit**

```bash
git add README.md examples/site/docs/components/roadmap.md
git commit -m "docs: document GitlabRoadmap component"
```

---

## Task 12: Full verification

- [ ] **Step 1: Typecheck + full test suite**

Run: `npm run typecheck && npm run test`
Expected: PASS.

- [ ] **Step 2: Build the package**

Run: `npm run build`
Expected: PASS — emits `dist/` with `.js` + `.d.ts` for the new files.

- [ ] **Step 3: e2e build (pipeline touched — run once)**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS — the example Docusaurus site (including `roadmap.md`) builds. If the example embeds hit a private/unavailable resource, point them at a public group/project or mark the page so the e2e's `strict:false` dev config degrades to `Fallback` rather than aborting.

- [ ] **Step 4: Verify commits are signed**

Run: `git log --format="%G? %s" -12`
Expected: every roadmap commit shows `G`.

---

## Self-review notes

- **Spec coverage:** source prop (Tasks 4–5), both layouts (8–9), scale auto+override (2), state/labels/from/to/limit/order/groupBy/colorBy/showProgress/showLabels (4, 7–9), epics+milestones normalization + label colors (4–5), no "today" marker / title-only / no markdown (components render text + `href` only — no `dangerouslySetInnerHTML`), strict degrade (4), 500-item ceiling (3), caching key excludes presentational props (4), registry + exports + docs (6, 10, 11).
- **Non-strict degrade:** `fetchRoadmap` rethrows on error; the remark layer (`src/remark/index.ts`) already converts a thrown fetch into an `error` prop when `strict` is false, which renders `<Fallback>` — consistent with every other fetcher. No separate empty-roadmap path is introduced.
- **Type consistency:** `RoadmapViewProps` is defined once in `RoadmapGantt.tsx` and reused by `RoadmapTimeline.tsx` and the dispatcher; `resolveColor(item, colorBy)` signature is identical across call sites; `BuildRoadmapOptions` matches the fetcher's construction (optional `scale`/`from`/`to` set conditionally to satisfy `exactOptionalPropertyTypes` if enabled).
```
