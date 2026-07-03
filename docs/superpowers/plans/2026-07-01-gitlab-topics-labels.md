# GitlabTopics & GitlabLabels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two build-time MDX components — `<GitlabTopics>` (instance-wide topic catalog) and `<GitlabLabels>` (project/group labels, list or card layout) — each rendering items as links to the matching GitLab search/filter view.

**Architecture:** Follow the existing pipeline `registry → fetcher → inject → pure component`. New client methods wrap gitbeaker's `Topics`, `ProjectLabels`, `GroupLabels`, and `Groups` resources. Fetchers normalize snake_case → camelCase, then apply filter → sort → limit in memory (cached via `memo`). Components are pure (`error → Fallback; !data → null; else render`). The `layout` attribute is presentational: it survives remark (`injectProp` only pushes `data`/`error`, never strips attributes) and reaches the component as a prop.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), `@gitbeaker/rest`, React, Vitest + React Testing Library, Docusaurus 3.

Spec: `docs/superpowers/specs/2026-07-01-gitlab-topics-labels-design.md`

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/gitlab/types.ts` | modify | Add `TopicData`, `LabelData` |
| `src/gitlab/client.ts` | modify | Add `getTopics`, `getProjectLabels`, `getGroupLabels`, `getGroup` |
| `src/gitlab/client.test.ts` | modify | Mock + test the 4 new client methods |
| `src/gitlab/fetchers.ts` | modify | Add `fetchTopics`, `fetchLabels` + helpers `readOrder`, `compileFilter`, `sortByName`, `readLayout` |
| `src/gitlab/fetchers.test.ts` | modify | Test both fetchers + helper behavior |
| `src/components/GitlabTopics.tsx` | create | Pure topics component |
| `src/components/GitlabTopics.test.tsx` | create | Component tests |
| `src/components/GitlabLabels.tsx` | create | Pure labels component (list + cards) |
| `src/components/GitlabLabels.test.tsx` | create | Component tests |
| `src/components/types.ts` | modify | Re-export `TopicData`, `LabelData` |
| `src/components/index.ts` | modify | Export both components + new types |
| `src/index.ts` | modify | Export `TopicData`, `LabelData` |
| `src/remark/registry.ts` | modify | Register `GitlabTopics`, `GitlabLabels` |
| `README.md` | modify | Document both components |
| `examples/site/docs/components/topics.mdx` | create | Illustrative docs page |
| `examples/site/docs/components/labels.mdx` | create | Illustrative docs page |
| `examples/site/docs/intro.mdx` | modify | Live usage for e2e |
| `test/e2e/fixtures.ts` | modify | Stub topics/labels/group endpoints |
| `test/e2e/build.test.ts` | modify | Assert topics/labels baked into HTML |

---

### Task 1: Domain types + client methods

**Files:**
- Modify: `src/gitlab/types.ts`
- Modify: `src/gitlab/client.ts`
- Modify: `src/gitlab/client.test.ts`

- [ ] **Step 1: Add domain types**

Append to `src/gitlab/types.ts`:

```ts
export interface TopicData {
  name: string;
  title: string;
  totalProjectsCount: number;
  webUrl: string;
}

export interface LabelData {
  name: string;
  color: string;
  textColor: string;
  description: string | null;
  webUrl: string;
}
```

- [ ] **Step 2: Write failing client tests**

In `src/gitlab/client.test.ts`, add four mock fns near the existing ones (after `showRawMock`):

```ts
const topicsAllMock = vi.fn();
const projectLabelsAllMock = vi.fn();
const groupLabelsAllMock = vi.fn();
const groupShowMock = vi.fn();
```

Add them to the object returned by the mocked `Gitlab` constructor (inside the `return { ... }`):

```ts
      Topics: { all: topicsAllMock },
      ProjectLabels: { all: projectLabelsAllMock },
      GroupLabels: { all: groupLabelsAllMock },
      Groups: { show: groupShowMock },
```

Add resets inside `beforeEach` (next to the existing `*.mockReset()` calls):

```ts
  topicsAllMock.mockReset();
  projectLabelsAllMock.mockReset();
  groupLabelsAllMock.mockReset();
  groupShowMock.mockReset();
```

Add these tests inside the `describe("GitLabClient", ...)` block:

```ts
  it("getTopics delegates to Topics.all with a 100-per-page request", async () => {
    topicsAllMock.mockResolvedValue([{ name: "docs", total_projects_count: 3 }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getTopics();
    expect(data).toEqual([{ name: "docs", total_projects_count: 3 }]);
    expect(topicsAllMock).toHaveBeenCalledWith({ perPage: 100 });
  });

  it("getProjectLabels delegates to ProjectLabels.all", async () => {
    projectLabelsAllMock.mockResolvedValue([{ name: "bug" }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getProjectLabels("group/repo");
    expect(data).toEqual([{ name: "bug" }]);
    expect(projectLabelsAllMock).toHaveBeenCalledWith("group/repo");
  });

  it("getGroupLabels delegates to GroupLabels.all", async () => {
    groupLabelsAllMock.mockResolvedValue([{ name: "epic" }]);
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getGroupLabels("my-group");
    expect(data).toEqual([{ name: "epic" }]);
    expect(groupLabelsAllMock).toHaveBeenCalledWith("my-group");
  });

  it("getGroup delegates to Groups.show", async () => {
    groupShowMock.mockResolvedValue({ id: 9, web_url: "https://x/groups/my-group" });
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const data = await c.getGroup("my-group");
    expect(data).toEqual({ id: 9, web_url: "https://x/groups/my-group" });
    expect(groupShowMock).toHaveBeenCalledWith("my-group");
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/gitlab/client.test.ts`
Expected: FAIL — `c.getTopics is not a function` (and the three others).

- [ ] **Step 4: Implement the client methods**

In `src/gitlab/client.ts`, add these methods to the `GitLabClient` class (after `getFileRaw`):

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/client.test.ts`
Expected: PASS (all client tests, old and new).

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/types.ts src/gitlab/client.ts src/gitlab/client.test.ts
git commit -m "feat: add topic/label domain types and gitbeaker client methods"
```

---

### Task 2: Topics fetcher + shared helpers

**Files:**
- Modify: `src/gitlab/fetchers.ts`
- Modify: `src/gitlab/fetchers.test.ts`

Note on API shape (gitbeaker `Topics.all`, snake_case): each item has `name` (slug), `title` (display), `total_projects_count`.

- [ ] **Step 1: Write failing fetcher tests**

In `src/gitlab/fetchers.test.ts`, add `fetchTopics` to the import from `./fetchers`:

```ts
import { fetchProjectInfo, fetchReleases, fetchIssues, fetchReadme, fetchFile, fetchTopics, fetchLabels } from "./fetchers";
```

(Importing `fetchLabels` now too; it is implemented in Task 3. The file won't type-check until Task 3, but these `fetchTopics` tests run.)

Add this block:

```ts
describe("fetchTopics", () => {
  const raw = [
    { name: "docs", title: "Docs", total_projects_count: 3 },
    { name: "api", title: "API", total_projects_count: 10 },
    { name: "internal-tool", title: "Internal Tool", total_projects_count: 1 },
  ];

  it("normalizes topics and builds the explore URL, sorted by title ascending", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), {});
    expect(data.map((t) => t.title)).toEqual(["API", "Docs", "Internal Tool"]);
    expect(data[0]).toEqual({
      name: "api",
      title: "API",
      totalProjectsCount: 10,
      webUrl: "https://gitlab.com/explore/projects/topics/api",
    });
  });

  it("sorts descending when order=name:desc", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), { order: "name:desc" });
    expect(data.map((t) => t.title)).toEqual(["Internal Tool", "Docs", "API"]);
  });

  it("filters by case-insensitive regex on the title", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), { filter: "^a" });
    expect(data.map((t) => t.title)).toEqual(["API"]);
  });

  it("applies the limit after filtering and sorting", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    const data = await fetchTopics(ctx(client), { limit: 2 });
    expect(data.map((t) => t.title)).toEqual(["API", "Docs"]);
  });

  it("throws on an invalid order value", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    await expect(fetchTopics(ctx(client), { order: "count" })).rejects.toThrow(/order/);
  });

  it("throws on an invalid filter regex", async () => {
    const client = { getTopics: vi.fn(async () => raw) };
    await expect(fetchTopics(ctx(client), { filter: "(" })).rejects.toThrow(/filter/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t fetchTopics`
Expected: FAIL — `fetchTopics is not a function`.

- [ ] **Step 3: Implement helpers + fetchTopics**

In `src/gitlab/fetchers.ts`:

Add `TopicData` and `LabelData` to the type import:

```ts
import type {
  FileData,
  IssueData,
  LabelData,
  ProjectInfoData,
  ReadmeData,
  ReleaseData,
  TopicData,
} from "./types";
```

Add these helpers (place them near the top, after the `memo` helper):

```ts
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
```

Add the fetcher:

```ts
export async function fetchTopics(ctx: GitLabContext, attrs: Attrs): Promise<TopicData[]> {
  const order = readOrder(attrs.order);
  const match = compileFilter(attrs.filter);
  const limit = typeof attrs.limit === "number" ? attrs.limit : undefined;
  const host = ctx.options.host;
  const key = `topics:${String(attrs.filter ?? "")}:${order.dir}:${limit ?? "all"}`;
  return memo(ctx, key, async () => {
    const raw = await ctx.client.getTopics();
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t fetchTopics`
Expected: PASS (all six `fetchTopics` tests).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: add fetchTopics with filter/order/limit helpers"
```

---

### Task 3: Labels fetcher

**Files:**
- Modify: `src/gitlab/fetchers.ts`
- Modify: `src/gitlab/fetchers.test.ts`

Note on API shape (gitbeaker `ProjectLabels.all` / `GroupLabels.all`): each label has `name`, `color`, `text_color`, `description`, and (version-dependent) `archived`. Project/group `web_url` comes from `getProject` / `getGroup`.

- [ ] **Step 1: Write failing fetcher tests**

Add this block to `src/gitlab/fetchers.test.ts`:

```ts
describe("fetchLabels", () => {
  const rawLabels = [
    { name: "bug", color: "#d9534f", text_color: "#ffffff", description: "Defect", archived: false },
    { name: "feature", color: "#5cb85c", text_color: "#1a1a1a", description: null, archived: false },
    { name: "old", color: "#cccccc", text_color: "#000000", description: "retired", archived: true },
  ];

  function labelClient() {
    return {
      getProjectLabels: vi.fn(async () => rawLabels),
      getGroupLabels: vi.fn(async () => rawLabels),
      getProject: vi.fn(async () => ({ web_url: "https://gitlab.com/group/repo" })),
      getGroup: vi.fn(async () => ({ web_url: "https://gitlab.com/groups/my-group" })),
    };
  }

  it("normalizes project labels, drops archived, and builds the issues link", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { project: "group/repo" });
    expect(data.map((l) => l.name)).toEqual(["bug", "feature"]);
    expect(data[0]).toEqual({
      name: "bug",
      color: "#d9534f",
      textColor: "#ffffff",
      description: "Defect",
      webUrl: "https://gitlab.com/group/repo/-/issues?label_name[]=bug",
    });
    expect(client.getProjectLabels).toHaveBeenCalledWith("group/repo");
    expect(client.getGroupLabels).not.toHaveBeenCalled();
  });

  it("uses the group endpoints and group issues link for group scope", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { group: "my-group" });
    expect(client.getGroupLabels).toHaveBeenCalledWith("my-group");
    expect(client.getProjectLabels).not.toHaveBeenCalled();
    expect(data[0].webUrl).toBe("https://gitlab.com/groups/my-group/-/issues?label_name[]=bug");
  });

  it("filters by case-insensitive regex on the name", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { project: "group/repo", filter: "^feat" });
    expect(data.map((l) => l.name)).toEqual(["feature"]);
  });

  it("sorts descending and applies the limit", async () => {
    const client = labelClient();
    const data = await fetchLabels(ctx(client), { project: "group/repo", order: "name:desc", limit: 1 });
    expect(data.map((l) => l.name)).toEqual(["feature"]);
  });

  it("throws when neither project nor group is given", async () => {
    const client = labelClient();
    await expect(fetchLabels(ctx(client), {})).rejects.toThrow(/exactly one/);
  });

  it("throws when both project and group are given", async () => {
    const client = labelClient();
    await expect(
      fetchLabels(ctx(client), { project: "group/repo", group: "my-group" }),
    ).rejects.toThrow(/exactly one/);
  });

  it("throws on an invalid layout value", async () => {
    const client = labelClient();
    await expect(
      fetchLabels(ctx(client), { project: "group/repo", layout: "grid" }),
    ).rejects.toThrow(/layout/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t fetchLabels`
Expected: FAIL — `fetchLabels is not a function`.

- [ ] **Step 3: Implement readLayout + fetchLabels**

In `src/gitlab/fetchers.ts`, add the `readLayout` helper next to the others:

```ts
function readLayout(value: unknown): "list" | "cards" {
  if (value === undefined || value === "list" || value === "cards") {
    return value === undefined ? "list" : value;
  }
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabLabels> "layout" must be "list" or "cards"; ` +
      `got ${JSON.stringify(value)}.`,
  );
}
```

Add the fetcher:

```ts
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
    if (project !== undefined) {
      raw = await ctx.client.getProjectLabels(project);
      base = (await ctx.client.getProject(project)).web_url;
    } else {
      raw = await ctx.client.getGroupLabels(group as string | number);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: PASS (all fetcher tests, including `fetchTopics` and `fetchLabels`).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: add fetchLabels with project/group scope and archived filter"
```

---

### Task 4: GitlabTopics component

**Files:**
- Create: `src/components/GitlabTopics.tsx`
- Create: `src/components/GitlabTopics.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/components/GitlabTopics.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabTopics } from "./GitlabTopics";

const topics = [
  { name: "docs", title: "Docs", totalProjectsCount: 3, webUrl: "https://x/explore/projects/topics/docs" },
];

describe("GitlabTopics", () => {
  it("renders each topic as a link with its project-count bubble", () => {
    render(<GitlabTopics data={topics as any} />);
    const link = screen.getByRole("link", { name: /Docs/ });
    expect(link).toHaveAttribute("href", "https://x/explore/projects/topics/docs");
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabTopics error={{ message: "boom", project: "" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<GitlabTopics />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/GitlabTopics.test.tsx`
Expected: FAIL — cannot find module `./GitlabTopics`.

- [ ] **Step 3: Implement the component**

Create `src/components/GitlabTopics.tsx`:

```tsx
import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, TopicData } from "./types.js";

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

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/GitlabTopics.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/GitlabTopics.tsx src/components/GitlabTopics.test.tsx
git commit -m "feat: add GitlabTopics component"
```

---

### Task 5: GitlabLabels component

**Files:**
- Create: `src/components/GitlabLabels.tsx`
- Create: `src/components/GitlabLabels.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/components/GitlabLabels.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabLabels } from "./GitlabLabels";

const labels = [
  { name: "bug", color: "#d9534f", textColor: "#ffffff", description: "Defect", webUrl: "https://x/g/r/-/issues?label_name[]=bug" },
  { name: "feature", color: "#5cb85c", textColor: "#1a1a1a", description: null, webUrl: "https://x/g/r/-/issues?label_name[]=feature" },
];

describe("GitlabLabels", () => {
  it("defaults to the list layout: colored badge links, name only", () => {
    render(<GitlabLabels data={labels as any} />);
    const link = screen.getByRole("link", { name: "bug" });
    expect(link).toHaveAttribute("href", "https://x/g/r/-/issues?label_name[]=bug");
    expect(link).toHaveStyle({ backgroundColor: "#d9534f", color: "#ffffff" });
    // description is not rendered as body text in list layout
    expect(screen.queryByText("Defect")).not.toBeInTheDocument();
  });

  it("renders description text in the cards layout", () => {
    render(<GitlabLabels data={labels as any} layout="cards" />);
    expect(screen.getByRole("link", { name: /bug/ })).toHaveAttribute(
      "href",
      "https://x/g/r/-/issues?label_name[]=bug",
    );
    expect(screen.getByText("Defect")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabLabels error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<GitlabLabels />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/GitlabLabels.test.tsx`
Expected: FAIL — cannot find module `./GitlabLabels`.

- [ ] **Step 3: Implement the component**

Create `src/components/GitlabLabels.tsx`:

```tsx
import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, LabelData } from "./types.js";

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
            <span
              className="gitlab-badge gitlab-label"
              style={{ backgroundColor: l.color, color: l.textColor }}
            >
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
          <a
            className="gitlab-badge gitlab-label"
            href={l.webUrl}
            title={l.description ?? undefined}
            style={{ backgroundColor: l.color, color: l.textColor }}
          >
            {l.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/components/GitlabLabels.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/GitlabLabels.tsx src/components/GitlabLabels.test.tsx
git commit -m "feat: add GitlabLabels component with list and cards layouts"
```

---

### Task 6: Wire registry + exports

**Files:**
- Modify: `src/remark/registry.ts`
- Modify: `src/components/types.ts`
- Modify: `src/components/index.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Register the fetchers**

In `src/remark/registry.ts`, add `fetchTopics, fetchLabels` to the import from `../gitlab/fetchers.js`:

```ts
import {
  fetchProjectInfo,
  fetchReadme,
  fetchReleases,
  fetchIssues,
  fetchFile,
  fetchTopics,
  fetchLabels,
  type GitLabContext,
} from "../gitlab/fetchers.js";
```

Add two entries to `COMPONENT_REGISTRY`:

```ts
  GitlabTopics: fetchTopics,
  GitlabLabels: fetchLabels,
```

- [ ] **Step 2: Re-export the new types from the components barrel types**

In `src/components/types.ts`, add `TopicData` and `LabelData` to the re-exported list:

```ts
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FileData,
  TopicData,
  LabelData,
  FetchError,
  ComponentPayload,
} from "../gitlab/types.js";
```

- [ ] **Step 3: Export the components and types from the components index**

In `src/components/index.ts`, add the two component exports (after the `GitlabFile` line):

```ts
export { GitlabTopics } from "./GitlabTopics.js";
export { GitlabLabels } from "./GitlabLabels.js";
```

And add `TopicData, LabelData` to the `export type { ... }` block:

```ts
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FileData,
  TopicData,
  LabelData,
  FetchError,
  ComponentPayload,
} from "./types.js";
```

- [ ] **Step 4: Export the domain types from the package root**

In `src/index.ts`, add `TopicData, LabelData` to the type export block:

```ts
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FileData,
  TopicData,
  LabelData,
  FetchError,
} from "./gitlab/types.js";
```

- [ ] **Step 5: Typecheck and run the full unit suite**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck passes; all tests PASS (excludes the slow e2e unless invoked directly).

- [ ] **Step 6: Commit**

```bash
git add src/remark/registry.ts src/components/types.ts src/components/index.ts src/index.ts
git commit -m "feat: register GitlabTopics/GitlabLabels and export their types"
```

---

### Task 7: Documentation

**Files:**
- Create: `examples/site/docs/components/topics.mdx`
- Create: `examples/site/docs/components/labels.mdx`
- Modify: `README.md`

These example pages are illustrative (component usages inside fenced code blocks), matching every existing page under `examples/site/docs/components/`. Live e2e usage is added in Task 8.

- [ ] **Step 1: Create the topics docs page**

Create `examples/site/docs/components/topics.mdx`:

````mdx
---
title: GitlabTopics
sidebar_position: 7
---

# `<GitlabTopics>`

Renders the GitLab instance's topic catalog as a list of links. Each topic links to
its projects-by-topic explore page and shows a bubble with the number of projects
using it. Topics are instance-wide, so this component takes no `project`/`group`.

## Usage

```mdx
<GitlabTopics />

<GitlabTopics filter="^data" order="name:desc" limit={10} />
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `filter` | `string` | — | Case-insensitive regular expression matched against the topic title. |
| `order` | `string` | `name` | `name` / `name:asc` / `name:desc`. |
| `limit` | `number` | all | Maximum number of topics to show (applied after filter + sort). |

## Notes

- Each topic links to `<host>/explore/projects/topics/<name>`.
- The count bubble is the topic's `total_projects_count`.
````

- [ ] **Step 2: Create the labels docs page**

Create `examples/site/docs/components/labels.mdx`:

````mdx
---
title: GitlabLabels
sidebar_position: 8
---

# `<GitlabLabels>`

Renders the labels of a project **or** a group as a list of links. Each label links
to the issues list filtered by that label and keeps its GitLab color. Two layouts are
available.

## Usage

```mdx
<GitlabLabels project="group/repo" />

<GitlabLabels group="my-group" layout="cards" filter="^team::" order="name" limit={20} />
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `project` | `string \| number` | — | Project path or numeric ID. Provide **either** this or `group`. |
| `group` | `string \| number` | — | Group path or numeric ID. Provide **either** this or `project`. |
| `layout` | `string` | `list` | `list` (colored badges) or `cards` (badge + description). |
| `filter` | `string` | — | Case-insensitive regular expression matched against the label name. |
| `order` | `string` | `name` | `name` / `name:asc` / `name:desc`. |
| `limit` | `number` | all | Maximum number of labels to show (applied after filter + sort). |

## Notes

- Exactly one of `project` / `group` is required; providing both or neither fails the build.
- Each label links to `<project-or-group>/-/issues?label_name[]=<name>`.
- Archived labels are omitted.
````

- [ ] **Step 3: Add both components to the README**

In `README.md`, immediately after the `### `<GitlabFile>`` section (and before the next `###`/section), add:

````markdown
### `<GitlabTopics>`

The instance topic catalog as links, each with a project-count bubble.

```mdx
<GitlabTopics filter="^data" order="name:desc" limit={10} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `filter` | string | — | Case-insensitive regex on the topic title |
| `order` | string | `name` | `name`, `name:asc`, or `name:desc` |
| `limit` | number | all | Max topics to show |

### `<GitlabLabels>`

A project's or group's labels as links to the filtered issues list. `list` or `cards` layout.

```mdx
<GitlabLabels project="group/repo" layout="cards" filter="^team::" limit={20} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `project` | string \| number | — | Provide either `project` or `group` |
| `group` | string \| number | — | Provide either `project` or `group` |
| `layout` | string | `list` | `list` or `cards` |
| `filter` | string | — | Case-insensitive regex on the label name |
| `order` | string | `name` | `name`, `name:asc`, or `name:desc` |
| `limit` | number | all | Max labels to show |
````

- [ ] **Step 4: Verify the docs build parses (typecheck is unaffected; sanity-check MDX later via e2e)**

Run: `git diff --stat`
Expected: shows the two new `.mdx` files and the modified `README.md`.

- [ ] **Step 5: Commit**

```bash
git add examples/site/docs/components/topics.mdx examples/site/docs/components/labels.mdx README.md
git commit -m "docs: document GitlabTopics and GitlabLabels"
```

---

### Task 8: End-to-end coverage

**Files:**
- Modify: `test/e2e/fixtures.ts`
- Modify: `examples/site/docs/intro.mdx`
- Modify: `test/e2e/build.test.ts`

- [ ] **Step 1: Add stub endpoints for topics, labels, and group**

In `test/e2e/fixtures.ts`, inside the `createServer` handler, add these branches **before** the generic `if (url.startsWith("/api/v4/projects/group%2Frepo") ...)` branch (project-labels must match before the generic project route), and add the topics/group routes anywhere before the final 404:

```ts
    if (url.startsWith("/api/v4/topics")) {
      return send([
        { name: "docs", title: "Docs", total_projects_count: 4 },
        { name: "api", title: "API", total_projects_count: 9 },
      ]);
    }
    if (url.startsWith("/api/v4/projects/group%2Frepo/labels")) {
      return send([
        { name: "bug", color: "#d9534f", text_color: "#ffffff", description: "Defect", archived: false },
        { name: "feature", color: "#5cb85c", text_color: "#1a1a1a", description: "New capability", archived: false },
      ]);
    }
    if (url.startsWith("/api/v4/groups/my-group/labels")) {
      return send([
        { name: "epic", color: "#8e44ad", text_color: "#ffffff", description: "Cross-project", archived: false },
      ]);
    }
    if (url.startsWith("/api/v4/groups/my-group")) {
      return send({ id: 42, web_url: "https://x/groups/my-group" });
    }
```

Note: the existing `/api/v4/projects/group%2Frepo/releases` and `.../issues` branches already sit before the generic project branch; place the new `.../labels` branch alongside them so it is not swallowed by the generic route.

- [ ] **Step 2: Add live component usage to the e2e page**

Append to `examples/site/docs/intro.mdx`:

```mdx
## Topics

<GitlabTopics limit={5} />

## Labels

<GitlabLabels project="group/repo" layout="cards" />

<GitlabLabels group="my-group" />
```

- [ ] **Step 3: Add e2e assertions**

In `test/e2e/build.test.ts`, add this test inside the `describe("e2e: docusaurus build", ...)` block:

```ts
  it("bakes topics and labels into the static html", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    // topic explore link + count bubble (robust against Docusaurus's "Docs" navbar label)
    expect(html).toContain("/explore/projects/topics/docs");
    expect(html).toContain("gitlab-count-bubble");
    // project label (cards layout) with its description and issues link
    expect(html).toContain("gitlab-label-card");
    expect(html).toContain("label_name[]=bug");
    expect(html).toContain("New capability");
    // group label with the group issues link
    expect(html).toContain("/groups/my-group/-/issues?label_name[]=epic");
  });
```

- [ ] **Step 4: Run the e2e build test**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS (~1 min). If it fails on a 404 for labels, confirm the `.../labels` branch precedes the generic `/api/v4/projects/group%2Frepo` branch.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/fixtures.ts examples/site/docs/intro.mdx test/e2e/build.test.ts
git commit -m "test: e2e coverage for GitlabTopics and GitlabLabels"
```

---

### Task 9: Final verification

- [ ] **Step 1: Full typecheck + unit tests**

Run: `npm run typecheck && npx vitest run`
Expected: typecheck clean; all unit tests PASS.

- [ ] **Step 2: Build the package**

Run: `npm run build`
Expected: compiles to `dist/` with no errors (ESM `.js` + `.d.ts`).

- [ ] **Step 3: Update the graphify graph**

Run: `graphify update .`
Expected: graph regenerated (AST-only, no API cost).

- [ ] **Step 4: Commit any remaining artifacts**

```bash
git add -A
git commit -m "chore: rebuild and refresh graphify graph" || echo "nothing to commit"
```

---

## Notes for the implementer

- **ESM imports:** intra-package imports use explicit `.js` extensions (e.g. `./Fallback.js`). Match this in new files.
- **snake_case → camelCase:** gitbeaker responses are snake_case (`total_projects_count`, `text_color`, `web_url`). Normalize in the fetcher only.
- **Archived field:** the labels API `archived` field may not exist on older GitLab versions; the `l.archived !== true` filter is a safe no-op there. If you have access to the target instance, confirm the field name during Step 3 of Task 3.
- **`layout` is presentational:** it is validated in the fetcher (`readLayout`) but never baked into the payload; the surviving JSX attribute reaches the component as a prop.
- **Do not** import `@theme/*` or `@docusaurus/*` in `src/components/*` (breaks SSR). Plain class names only; no CSS module import.
