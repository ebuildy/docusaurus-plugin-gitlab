# GitlabReadme TOC Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `toc` attribute to `<GitlabReadme>` that hides the table of contents, renders it inline (today's behavior), or merges the README's headings into Docusaurus' native right-hand sidebar TOC in document order.

**Architecture:** All work is build-time, in the existing remark pipeline. `renderMarkdown`/`rehypeGitlabToc` learn a TOC mode (`auto`/`inline`/`sidebar`/`hidden`) that controls heading-id assignment and inline `<nav>` emission. For `sidebar` mode the fetcher returns the README's heading entries, and the remark transformer merges them into the page's existing `export const toc` (which Docusaurus' default `toc` plugin generates *before* our plugin runs). The rendered README HTML and the React component are unchanged.

**Tech Stack:** TypeScript (ESM), unified/remark/rehype, hast, `github-slugger`, `estree-util-value-to-estree`, Vitest, Docusaurus 3.

---

## Spec

Design: [docs/superpowers/specs/2026-06-29-gitlab-readme-toc-placement-design.md](../specs/2026-06-29-gitlab-readme-toc-placement-design.md)

## Verified facts (do not re-derive)

- Docusaurus 3.10 `@docusaurus/mdx-loader`: default `headings` and `toc` remark plugins run **before** user `remarkPlugins`, so when our `remarkGitlab` runs, `export const toc` already exists and `heading` mdast nodes carry ids at `node.data.id` and `node.data.hProperties.id`.
- Docusaurus' `toc` plugin **respects** an explicit `export const toc` and does not overwrite it.
- The `export const toc` node is an mdast `mdxjsEsm` node whose `data.estree` holds the `ExportNamedDeclaration`; the MDX compiler uses `data.estree` (not the node's `value` string), so mutating `data.estree` in place is sufficient.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/gitlab/toc.ts` | modify | `rehypeGitlabToc({ mode, collect })`: id assignment + inline nav per mode; export `TocMode`, `TocEntry`. |
| `src/gitlab/markdown.ts` | modify | Thread `tocMode`/`collectToc` into `rehypeGitlabToc`. |
| `src/gitlab/types.ts` | modify | `ReadmeData.toc?: TocEntry[]`. |
| `src/gitlab/fetchers.ts` | modify | `fetchReadme` reads/validates `attrs.toc`, passes mode, returns `toc`, mode in cache key. |
| `src/remark/toc-merge.ts` | create | Pure TOC-item logic: `TocItem`, `buildTocItems`, `insertReadmeToc`. |
| `src/remark/toc-export.ts` | create | estree/tree bridge: find/create the `toc` export, read/write items, document-order position, `mergeReadmeTocs`. |
| `src/remark/index.ts` | modify | Collect sidebar readmes and run `mergeReadmeTocs`. |
| `test/e2e/fixtures.ts` | modify | Stub README gains h2 headings. |
| `examples/site/docs/intro.mdx` | modify | Use `toc="sidebar"`. |
| `examples/site/docs/components/readme.mdx`, `README.md` | modify | Document the `toc` attribute. |

---

## Task 1: TOC rendering modes (`toc.ts` + `markdown.ts`)

**Files:**
- Modify: `src/gitlab/toc.ts`
- Modify: `src/gitlab/markdown.ts`
- Test: `src/gitlab/toc.test.ts`, `src/gitlab/markdown.test.ts`

- [ ] **Step 1: Write failing tests for the new modes**

Append these tests inside the `describe("rehypeGitlabToc", …)` block in `src/gitlab/toc.test.ts`:

```ts
it("sidebar mode: assigns ids, emits no inline nav, strips the marker", async () => {
  const md = "[[_TOC_]]\n\n## Install\n\n### Steps\n";
  const html = await renderMarkdown(md, { tocMode: "sidebar" });
  expect(html).toContain('<h2 id="install">');
  expect(html).toContain('<h3 id="steps">');
  expect(html).not.toContain("gitlab-md-toc");
  expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
});

it("sidebar mode: assigns ids even without a marker", async () => {
  const html = await renderMarkdown("## Install\n\n### Steps\n", { tocMode: "sidebar" });
  expect(html).toContain('<h2 id="install">');
  expect(html).toContain('<h3 id="steps">');
  expect(html).not.toContain("gitlab-md-toc");
});

it("sidebar mode: collects heading entries into the provided array", async () => {
  const collectToc: { level: number; id: string; text: string }[] = [];
  await renderMarkdown("## Install\n\n### Steps\n", { tocMode: "sidebar", collectToc });
  expect(collectToc).toEqual([
    { level: 2, id: "install", text: "Install" },
    { level: 3, id: "steps", text: "Steps" },
  ]);
});

it("hidden mode: assigns ids but renders no nav and strips the marker", async () => {
  const html = await renderMarkdown("[[_TOC_]]\n\n## Install\n", { tocMode: "hidden" });
  expect(html).toContain('<h2 id="install">');
  expect(html).not.toContain("gitlab-md-toc");
  expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
});

it("inline mode: renders the nav above the first heading when no marker is present", async () => {
  const html = await renderMarkdown("intro text\n\n## Install\n\n### Steps\n", { tocMode: "inline" });
  expect(html).toContain('<nav class="gitlab-md-toc">');
  expect(html).toContain('<a href="#install">Install</a>');
  expect(html).toContain('<h2 id="install">');
  // nav comes before the first heading
  expect(html.indexOf("gitlab-md-toc")).toBeLessThan(html.indexOf('<h2 id="install">'));
});

it("inline mode: replaces the marker in place when present", async () => {
  const html = await renderMarkdown("## A\n\n[[_TOC_]]\n\n## B\n", { tocMode: "inline" });
  expect(html).toContain('<nav class="gitlab-md-toc">');
  // nav sits between the two headings (where the marker was)
  expect(html.indexOf("gitlab-md-toc")).toBeGreaterThan(html.indexOf('<h2 id="a">'));
  expect(html.indexOf("gitlab-md-toc")).toBeLessThan(html.indexOf('<h2 id="b">'));
});
```

- [ ] **Step 2: Run the new tests, verify they fail**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: FAIL — `renderMarkdown` does not accept `tocMode`/`collectToc`, sidebar/hidden/inline behavior absent.

- [ ] **Step 3: Refactor `rehypeGitlabToc` to be mode-aware**

Replace the top of `src/gitlab/toc.ts` (the imports through the end of `rehypeGitlabToc`) with:

```ts
import GithubSlugger from "github-slugger";
import type { Root, Element, RootContent } from "hast";
import { toString } from "hast-util-to-string";
import { visit, EXIT } from "unist-util-visit";

/**
 * Token we substitute for a standalone `[[_TOC_]]` line BEFORE markdown parsing.
 * Underscores inside a word are not emphasis, so this survives the pipeline
 * intact as plain paragraph text.
 */
export const TOC_PLACEHOLDER = "GITLAB_MD_TOC_PLACEHOLDER";

/** Where the README's table of contents is rendered. */
export type TocMode = "auto" | "inline" | "sidebar" | "hidden";

const HEADING_LEVELS: Record<string, number> = { h2: 2, h3: 3, h4: 4, h5: 5 };

export interface TocEntry {
  level: number;
  id: string;
  text: string;
}

export interface RehypeGitlabTocOptions {
  /** Defaults to "auto" (today's marker-driven behavior). */
  mode?: TocMode;
  /** When set in "sidebar" mode, collected heading entries are pushed here. */
  collect?: TocEntry[];
}

/**
 * Rehype plugin. Must run AFTER rehype-sanitize so the ids/anchors it generates
 * are not clobbered by the sanitize schema.
 *
 * - auto: today's behavior — no-op unless a `[[_TOC_]]` placeholder is present;
 *   then assign heading ids and replace the marker with an inline nav.
 * - inline: always assign ids and render the nav (at the marker if present,
 *   else above the first heading).
 * - sidebar: assign ids, strip the marker, push entries into `collect`, no nav.
 * - hidden: assign ids, strip the marker, no nav.
 */
export function rehypeGitlabToc(options: RehypeGitlabTocOptions = {}) {
  const mode: TocMode = options.mode ?? "auto";
  return (tree: Root) => {
    const placeholders: { parent: Root | Element; index: number }[] = [];
    visit(tree, "element", (node, index, parent) => {
      if (
        node.tagName === "p" &&
        parent &&
        typeof index === "number" &&
        toString(node).trim() === TOC_PLACEHOLDER
      ) {
        placeholders.push({ parent: parent as Root | Element, index });
      }
    });

    const hasMarker = placeholders.length > 0;

    // Auto mode keeps today's behavior: do nothing unless the marker is present.
    if (mode === "auto" && !hasMarker) return;

    // Assign ids to h2-h5 and collect entries (needed by every active mode).
    const slugger = new GithubSlugger();
    const entries: TocEntry[] = [];
    visit(tree, "element", (node: Element) => {
      const level = HEADING_LEVELS[node.tagName];
      if (!level) return;
      const text = toString(node).trim();
      node.properties ??= {};
      const existing = node.properties.id;
      let id: string;
      if (typeof existing === "string" && existing.length > 0) {
        id = existing;
        slugger.slug(text); // keep dedupe counter in sync
      } else {
        id = slugger.slug(text);
        node.properties.id = id;
      }
      entries.push({ level, id, text });
    });

    if (mode === "sidebar" && options.collect) {
      options.collect.push(...entries);
    }

    // Sidebar/hidden render no inline nav; strip the marker if present.
    if (mode === "sidebar" || mode === "hidden") {
      for (const { parent, index } of placeholders.reverse()) {
        parent.children.splice(index, 1);
      }
      return;
    }

    const nav = buildToc(entries);

    // auto-with-marker and inline-with-marker: replace the marker with the nav.
    if (hasMarker) {
      for (const { parent, index } of placeholders.reverse()) {
        if (nav) parent.children.splice(index, 1, structuredClone(nav) as RootContent);
        else parent.children.splice(index, 1);
      }
      return;
    }

    // inline without a marker: insert the nav above the first heading.
    if (nav) {
      let firstHeading: { parent: Root | Element; index: number } | null = null;
      visit(tree, "element", (n: Element, idx, parent) => {
        if (HEADING_LEVELS[n.tagName] && parent && typeof idx === "number") {
          firstHeading = { parent: parent as Root | Element, index: idx };
          return EXIT;
        }
        return undefined;
      });
      if (firstHeading) {
        const { parent, index } = firstHeading;
        parent.children.splice(index, 0, structuredClone(nav) as RootContent);
      }
    }
  };
}
```

Leave the existing `buildToc` function below it unchanged.

- [ ] **Step 4: Thread `tocMode`/`collectToc` through `renderMarkdown`**

In `src/gitlab/markdown.ts`, update the `toc` import and `RenderOptions`, and pass options to the plugin.

Change the import line:

```ts
import { rehypeGitlabToc, TOC_PLACEHOLDER, type TocMode, type TocEntry } from "./toc.js";
```

Extend `RenderOptions`:

```ts
export interface RenderOptions {
  transformImageSrc?: (src: string) => Promise<string>;
  transformLinkHref?: (href: string) => Promise<string>;
  tocMode?: TocMode;
  collectToc?: TocEntry[];
}
```

Change the plugin registration line from `.use(rehypeGitlabToc)` to:

```ts
    .use(rehypeGitlabToc, { mode: opts.tocMode ?? "auto", collect: opts.collectToc })
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run src/gitlab/toc.test.ts src/gitlab/markdown.test.ts`
Expected: PASS — all existing tests (auto mode via `{}`) and the new mode tests pass, including the XSS regression in `markdown.test.ts`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/gitlab/toc.ts src/gitlab/markdown.ts src/gitlab/toc.test.ts
git commit -m "feat: mode-aware TOC rendering in rehypeGitlabToc

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `fetchReadme` reads the `toc` attribute

**Files:**
- Modify: `src/gitlab/types.ts`
- Modify: `src/gitlab/fetchers.ts`
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Write failing tests**

Replace the `describe("fetchReadme", …)` block in `src/gitlab/fetchers.test.ts` by adding these tests inside it (keep the two existing ones):

```ts
  it("sidebar mode returns toc entries and assigns heading ids", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n\n### Steps\n"),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r", toc: "sidebar" });
    expect(data.toc).toEqual([
      { level: 2, id: "install", text: "Install" },
      { level: 3, id: "steps", text: "Steps" },
    ]);
    expect(data.html).toContain('<h2 id="install">');
  });

  it("does not attach toc entries when toc is not 'sidebar'", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n"),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r", toc: "inline" });
    expect(data.toc).toBeUndefined();
    expect(data.html).toContain("gitlab-md-toc");
  });

  it("rejects an invalid toc value", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n"),
    };
    await expect(fetchReadme(ctx(client), { project: "g/r", toc: "left" })).rejects.toThrow(
      /"toc" must be one of/,
    );
  });

  it("keys the cache by toc mode so different modes do not collide", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "## Install\n"),
    };
    const c = ctx(client);
    const sidebar = await fetchReadme(c, { project: "g/r", toc: "sidebar" });
    const inline = await fetchReadme(c, { project: "g/r", toc: "inline" });
    expect(sidebar.toc).toBeDefined();
    expect(inline.toc).toBeUndefined();
    expect(inline.html).toContain("gitlab-md-toc");
  });
```

- [ ] **Step 2: Run the new tests, verify they fail**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: FAIL — `fetchReadme` ignores `toc`, never returns `toc`, never throws on bad values.

- [ ] **Step 3: Add `toc` to `ReadmeData`**

In `src/gitlab/types.ts`, add a type-only import at the top:

```ts
import type { TocEntry } from "./toc.js";
```

and extend the interface:

```ts
export interface ReadmeData {
  ref: string;
  html: string;
  toc?: TocEntry[];
}
```

- [ ] **Step 4: Update `fetchReadme`**

In `src/gitlab/fetchers.ts`, add to the imports near the top (after the `renderMarkdown` import):

```ts
import type { TocEntry, TocMode } from "./toc";
```

Add this helper above `fetchReadme`:

```ts
function readTocMode(value: unknown): TocMode {
  if (value === undefined) return "auto";
  if (value === "hidden" || value === "inline" || value === "sidebar") return value;
  throw new Error(
    `@ebuildy/docusaurus-plugin-gitlab: <GitlabReadme> "toc" must be one of ` +
      `"hidden", "inline", "sidebar"; got ${JSON.stringify(value)}.`,
  );
}
```

Replace the body of `fetchReadme` with:

```ts
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
```

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/gitlab/types.ts src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: fetchReadme reads the toc attribute and returns sidebar entries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Pure TOC-item merge logic (`toc-merge.ts`)

**Files:**
- Create: `src/remark/toc-merge.ts`
- Test: `src/remark/toc-merge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/remark/toc-merge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTocItems, insertReadmeToc, type TocItem } from "./toc-merge";

describe("buildTocItems", () => {
  it("returns [] for no entries", () => {
    expect(buildTocItems([])).toEqual([]);
  });

  it("nests deeper headings under the preceding shallower one", () => {
    const items = buildTocItems([
      { level: 2, id: "a", text: "A" },
      { level: 3, id: "b", text: "B" },
      { level: 2, id: "c", text: "C" },
    ]);
    expect(items).toEqual([
      { value: "A", id: "a", level: 2, children: [{ value: "B", id: "b", level: 3, children: [] }] },
      { value: "C", id: "c", level: 2, children: [] },
    ]);
  });
});

describe("insertReadmeToc", () => {
  const page: TocItem[] = [
    { value: "Intro", id: "intro", level: 2, children: [] },
    { value: "Outro", id: "outro", level: 2, children: [] },
  ];
  const readme: TocItem[] = [{ value: "Install", id: "install", level: 2, children: [] }];

  it("prepends README items when there is no preceding heading", () => {
    const out = insertReadmeToc(page, null, readme);
    expect(out.map((i) => i.id)).toEqual(["install", "intro", "outro"]);
  });

  it("inserts README items right after the preceding sibling heading", () => {
    const out = insertReadmeToc(page, "intro", readme);
    expect(out.map((i) => i.id)).toEqual(["intro", "install", "outro"]);
  });

  it("nests README items under the preceding heading when README is deeper", () => {
    const out = insertReadmeToc(page, "intro", [
      { value: "Deep", id: "deep", level: 3, children: [] },
    ]);
    expect(out[0].children.map((c) => c.id)).toEqual(["deep"]);
  });

  it("appends at root when the preceding id is not found", () => {
    const out = insertReadmeToc(page, "missing", readme);
    expect(out.map((i) => i.id)).toEqual(["intro", "outro", "install"]);
  });

  it("does not mutate the input array", () => {
    insertReadmeToc(page, "intro", readme);
    expect(page.map((i) => i.id)).toEqual(["intro", "outro"]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/remark/toc-merge.test.ts`
Expected: FAIL — module `./toc-merge` does not exist.

- [ ] **Step 3: Implement `toc-merge.ts`**

Create `src/remark/toc-merge.ts`:

```ts
import type { TocEntry } from "../gitlab/toc.js";

/** A single right-sidebar TOC entry, matching Docusaurus' `toc` export shape. */
export interface TocItem {
  value: string;
  id: string;
  level: number;
  children: TocItem[];
}

/** Nest flat heading entries into a level-based tree (README's own min level = root). */
export function buildTocItems(entries: TocEntry[]): TocItem[] {
  if (entries.length === 0) return [];
  const root: TocItem[] = [];
  const minLevel = Math.min(...entries.map((e) => e.level));
  const stack: { level: number; list: TocItem[] }[] = [{ level: minLevel, list: root }];
  for (const entry of entries) {
    const item: TocItem = { value: entry.text, id: entry.id, level: entry.level, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level > entry.level) stack.pop();
    let top = stack[stack.length - 1];
    if (entry.level > top.level) {
      const last = top.list[top.list.length - 1];
      const childList = last ? last.children : top.list;
      stack.push({ level: entry.level, list: childList });
      top = stack[stack.length - 1];
    }
    top.list.push(item);
  }
  return root;
}

/**
 * Insert `readmeItems` into a copy of `items` at the position following the
 * page heading with id `precedingId`:
 *  - precedingId === null  → prepend (component sits before all page headings)
 *  - README is deeper than the preceding heading → nest under it
 *  - otherwise → insert as following siblings
 *  - preceding id not found → append at root
 * Pure: never mutates the inputs.
 */
export function insertReadmeToc(
  items: TocItem[],
  precedingId: string | null,
  readmeItems: TocItem[],
): TocItem[] {
  if (readmeItems.length === 0) return items;
  const block = structuredClone(readmeItems);
  if (precedingId === null) return [...block, ...structuredClone(items)];

  const copy = structuredClone(items);
  const readmeMinLevel = Math.min(...readmeItems.map((i) => i.level));

  const recur = (list: TocItem[]): boolean => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === precedingId) {
        if (readmeMinLevel > list[i].level) list[i].children.push(...block);
        else list.splice(i + 1, 0, ...block);
        return true;
      }
      if (recur(list[i].children)) return true;
    }
    return false;
  };

  if (!recur(copy)) return [...copy, ...block];
  return copy;
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/remark/toc-merge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/remark/toc-merge.ts src/remark/toc-merge.test.ts
git commit -m "feat: pure TOC-item nesting and merge helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: estree/tree bridge (`toc-export.ts`)

**Files:**
- Create: `src/remark/toc-export.ts`
- Test: `src/remark/toc-export.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/remark/toc-export.test.ts`:

```ts
import { valueToEstree } from "estree-util-value-to-estree";
import { describe, it, expect } from "vitest";
import {
  findTocExport,
  makeTocExportNode,
  precedingHeadingId,
  readTocItems,
  writeTocItems,
  TocSliceError,
  mergeReadmeTocs,
} from "./toc-export";
import type { TocItem } from "./toc-merge";

const items: TocItem[] = [
  { value: "Intro", id: "intro", level: 2, children: [{ value: "Sub", id: "sub", level: 3, children: [] }] },
];

describe("readTocItems / writeTocItems", () => {
  it("round-trips toc items through estree", () => {
    expect(readTocItems(writeTocItems(items))).toEqual(items);
  });

  it("throws TocSliceError on a spread element (TOC slice)", () => {
    const arr = { type: "ArrayExpression", elements: [{ type: "SpreadElement" }] };
    expect(() => readTocItems(arr)).toThrow(TocSliceError);
  });
});

describe("findTocExport / makeTocExportNode", () => {
  it("creates and then finds a toc export node", () => {
    const node = makeTocExportNode(items);
    const tree = { type: "root", children: [node] };
    const found = findTocExport(tree);
    expect(found).not.toBeNull();
    expect(readTocItems(found!.declarator.init)).toEqual(items);
  });

  it("returns null when there is no toc export", () => {
    expect(findTocExport({ type: "root", children: [] })).toBeNull();
  });
});

describe("precedingHeadingId", () => {
  it("returns the id of the heading immediately before the target node", () => {
    const target = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tree = {
      type: "root",
      children: [
        { type: "heading", data: { id: "first", hProperties: { id: "first" } } },
        { type: "paragraph" },
        target,
        { type: "heading", data: { id: "later", hProperties: { id: "later" } } },
      ],
    };
    expect(precedingHeadingId(tree, target)).toBe("first");
  });

  it("returns null when no heading precedes the target", () => {
    const target = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tree = { type: "root", children: [target] };
    expect(precedingHeadingId(tree, target)).toBeNull();
  });
});

describe("mergeReadmeTocs", () => {
  it("merges README entries into the existing toc export at the component position", () => {
    const readmeNode = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tocNode = makeTocExportNode([{ value: "Intro", id: "intro", level: 2, children: [] }]);
    const tree = {
      type: "root",
      children: [
        tocNode,
        { type: "heading", data: { id: "intro", hProperties: { id: "intro" } } },
        readmeNode,
      ],
    };
    mergeReadmeTocs(tree, [{ node: readmeNode, entries: [{ level: 2, id: "install", text: "Install" }] }]);
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i) => i.id)).toEqual(["intro", "install"]);
  });

  it("creates a toc export when none exists", () => {
    const readmeNode = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tree = { type: "root", children: [readmeNode] };
    mergeReadmeTocs(tree, [{ node: readmeNode, entries: [{ level: 2, id: "install", text: "Install" }] }]);
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i) => i.id)).toEqual(["install"]);
  });

  it("leaves the export untouched when it contains a TOC slice", () => {
    const readmeNode = { type: "mdxJsxFlowElement", name: "GitlabReadme" };
    const tocNode = makeTocExportNode([]);
    // Simulate a slice: replace elements with a spread.
    tocNode.data.estree.body[0].declaration.declarations[0].init = valueToEstree([]);
    tocNode.data.estree.body[0].declaration.declarations[0].init.elements = [{ type: "SpreadElement" }];
    const tree = { type: "root", children: [tocNode, readmeNode] };
    mergeReadmeTocs(tree, [{ node: readmeNode, entries: [{ level: 2, id: "install", text: "Install" }] }]);
    const found = findTocExport(tree)!;
    expect(found.declarator.init.elements).toEqual([{ type: "SpreadElement" }]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx vitest run src/remark/toc-export.test.ts`
Expected: FAIL — module `./toc-export` does not exist.

- [ ] **Step 3: Implement `toc-export.ts`**

Create `src/remark/toc-export.ts`:

```ts
import { valueToEstree } from "estree-util-value-to-estree";
import { visit, EXIT } from "unist-util-visit";
import type { TocEntry } from "../gitlab/toc.js";
import { buildTocItems, insertReadmeToc, type TocItem } from "./toc-merge.js";

/** Thrown when the page `toc` export contains a TOC slice (spread) we can't round-trip. */
export class TocSliceError extends Error {}

/** Find the `export const toc = [...]` mdxjsEsm node Docusaurus generated. */
export function findTocExport(tree: any): { node: any; declarator: any } | null {
  for (const child of tree.children ?? []) {
    if (child.type !== "mdxjsEsm") continue;
    const body = child.data?.estree?.body ?? [];
    for (const stmt of body) {
      if (stmt.type === "ExportNamedDeclaration" && stmt.declaration?.type === "VariableDeclaration") {
        for (const d of stmt.declaration.declarations) {
          if (d.id?.type === "Identifier" && d.id.name === "toc" && d.init?.type === "ArrayExpression") {
            return { node: child, declarator: d };
          }
        }
      }
    }
  }
  return null;
}

/** Read an estree ArrayExpression of toc items back into plain TocItem objects. */
export function readTocItems(arrayExpr: any): TocItem[] {
  return (arrayExpr.elements ?? []).map(readItem);
}

function readItem(el: any): TocItem {
  if (!el || el.type !== "ObjectExpression") throw new TocSliceError();
  const item: TocItem = { value: "", id: "", level: 0, children: [] };
  for (const prop of el.properties) {
    if (prop.type !== "Property") throw new TocSliceError();
    const key = prop.key.type === "Identifier" ? prop.key.name : prop.key.value;
    if (key === "value") item.value = String(prop.value.value);
    else if (key === "id") item.id = String(prop.value.value);
    else if (key === "level") item.level = Number(prop.value.value);
    else if (key === "children") item.children = (prop.value.elements ?? []).map(readItem);
  }
  return item;
}

/** Serialize TocItem objects to an estree ArrayExpression. */
export function writeTocItems(items: TocItem[]): any {
  return valueToEstree(items, { preserveReferences: false });
}

/** Build a fresh `export const toc = [...]` mdxjsEsm node. */
export function makeTocExportNode(items: TocItem[]): any {
  const estree = {
    type: "Program",
    sourceType: "module",
    body: [
      {
        type: "ExportNamedDeclaration",
        specifiers: [],
        source: null,
        declaration: {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [
            {
              type: "VariableDeclarator",
              id: { type: "Identifier", name: "toc" },
              init: writeTocItems(items),
            },
          ],
        },
      },
    ],
  };
  return { type: "mdxjsEsm", value: "", data: { estree } };
}

/** Id of the page heading immediately preceding `target` in document order, or null. */
export function precedingHeadingId(tree: any, target: any): string | null {
  let last: string | null = null;
  visit(tree, (node: any) => {
    if (node === target) return EXIT;
    if (node.type === "heading") {
      const id = node.data?.id ?? node.data?.hProperties?.id;
      if (typeof id === "string") last = id;
    }
    return undefined;
  });
  return last;
}

/**
 * Merge each sidebar README's headings into the page's `toc` export, in document
 * order. Creates the export if absent. If the export contains a TOC slice
 * (unsupported edge case), leaves it untouched.
 */
export function mergeReadmeTocs(
  tree: any,
  readmes: { node: any; entries: TocEntry[] }[],
): void {
  if (readmes.length === 0) return;

  let target = findTocExport(tree);
  if (!target) {
    tree.children.push(makeTocExportNode([]));
    target = findTocExport(tree)!;
  }

  let items: TocItem[];
  try {
    items = readTocItems(target.declarator.init);
  } catch (err) {
    if (err instanceof TocSliceError) return; // page uses TOC slices: unsupported
    throw err;
  }

  for (const { node, entries } of readmes) {
    const precedingId = precedingHeadingId(tree, node);
    items = insertReadmeToc(items, precedingId, buildTocItems(entries));
  }

  target.declarator.init = writeTocItems(items);
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx vitest run src/remark/toc-export.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/remark/toc-export.ts src/remark/toc-export.test.ts
git commit -m "feat: estree bridge to merge README headings into the page toc export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Wire the merge into the remark transformer

**Files:**
- Modify: `src/remark/index.ts`
- Test: `src/remark/index.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/remark/index.test.ts`, add a helper to read a toc export and tests. First add this import at the top:

```ts
import { findTocExport, readTocItems } from "./toc-export";
```

Then add these tests inside `describe("remarkGitlab", …)`:

```ts
  it("merges sidebar README headings into the page toc export", async () => {
    const { fetchReadme } = await import("../gitlab/fetchers.js");
    (fetchReadme as any).mockResolvedValue({
      ref: "main",
      html: "<h2 id=\"install\">Install</h2>",
      toc: [{ level: 2, id: "install", text: "Install" }],
    });
    const src = [
      'export const toc = [{ value: "Intro", id: "intro", level: 2, children: [] }];',
      "",
      '<GitlabReadme project="g/r" toc="sidebar" />',
    ].join("\n");
    const tree = await transform(src, { host: "https://gitlab.com", strict: true });
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i: any) => i.id)).toContain("install");
  });

  it("does not touch the toc export for non-sidebar readmes", async () => {
    const { fetchReadme } = await import("../gitlab/fetchers.js");
    (fetchReadme as any).mockResolvedValue({ ref: "main", html: "<p>x</p>" });
    const src = [
      'export const toc = [{ value: "Intro", id: "intro", level: 2, children: [] }];',
      "",
      '<GitlabReadme project="g/r" toc="inline" />',
    ].join("\n");
    const tree = await transform(src, { host: "https://gitlab.com", strict: true });
    const found = findTocExport(tree)!;
    expect(readTocItems(found.declarator.init).map((i: any) => i.id)).toEqual(["intro"]);
  });
```

- [ ] **Step 2: Run the new tests, verify they fail**

Run: `npx vitest run src/remark/index.test.ts`
Expected: FAIL — the transformer does not merge README headings into the toc export.

- [ ] **Step 3: Wire `mergeReadmeTocs` into the transformer**

In `src/remark/index.ts`, add the import (next to the other `./` imports):

```ts
import { mergeReadmeTocs } from "./toc-export.js";
```

Inside the returned `transformer`, declare a collector before the `await Promise.all(...)` (right after `const jobs ...`/`visit(...)` block builds `jobs`):

```ts
    const sidebarReadmes: { node: any; entries: any[] }[] = [];
```

In the job body, immediately after the existing `injectProp(node, "data", data);` line, add:

```ts
          if (node.name === "GitlabReadme" && Array.isArray((data as any)?.toc)) {
            sidebarReadmes.push({ node, entries: (data as any).toc });
          }
```

After the `await Promise.all(...)` call (at the end of the transformer), add:

```ts
    mergeReadmeTocs(tree, sidebarReadmes);
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/remark/index.test.ts`
Expected: PASS (existing tests still pass; new merge tests pass).

- [ ] **Step 5: Full unit suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/remark/index.ts src/remark/index.test.ts
git commit -m "feat: merge sidebar README headings into the page toc during transform

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: e2e coverage + example site

**Files:**
- Modify: `test/e2e/fixtures.ts`
- Modify: `examples/site/docs/intro.mdx`
- Modify: `test/e2e/build.test.ts`

- [ ] **Step 1: Give the stub README real headings**

In `test/e2e/fixtures.ts`, change the README response (the `/repository/files/README.md/raw` branch) from:

```ts
      return send("# Hello\n\nReadme body.\n\n![logo](./logo.png)", "text/plain");
```

to:

```ts
      return send(
        "# Hello\n\nReadme body.\n\n## Install\n\nsetup\n\n## Usage\n\ngo\n\n![logo](./logo.png)",
        "text/plain",
      );
```

- [ ] **Step 2: Use sidebar mode on the index page**

In `examples/site/docs/intro.mdx`, change:

```mdx
<GitlabReadme project="group/repo" />
```

to:

```mdx
<GitlabReadme project="group/repo" toc="sidebar" />
```

- [ ] **Step 3: Add a failing e2e assertion**

In `test/e2e/build.test.ts`, add this test inside the `describe("e2e: docusaurus build", …)` block:

```ts
  it("merges sidebar README headings into the page's right-hand TOC", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    // README headings appear as Docusaurus TOC links, not as an inline gitlab nav.
    expect(html).toContain("table-of-contents");
    expect(html).toContain('href="#install"');
    expect(html).toContain('href="#usage"');
    expect(html).not.toContain("gitlab-md-toc");
    // README heading ids are present in the rendered body for the anchors to resolve.
    expect(html).toContain('id="install"');
  });
```

- [ ] **Step 4: Run the e2e build test**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS (slow, ~1 min). Existing e2e assertions ("Readme body", localized assets) still pass.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/fixtures.ts test/e2e/build.test.ts examples/site/docs/intro.mdx
git commit -m "test: e2e coverage for GitlabReadme toc=sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Documentation

**Files:**
- Modify: `examples/site/docs/components/readme.mdx`
- Modify: `README.md`

- [ ] **Step 1: Document the attribute in the component doc page**

In `examples/site/docs/components/readme.mdx`, add a `toc` row to the Props table (after the `ref` row):

```md
| `toc` | `"hidden" \| "inline" \| "sidebar"` | _auto_ | Where to render the table of contents. Omitted = today's behavior (inline only if the README has a `[[_TOC_]]` marker). |
```

Replace the "Table of contents" section at the bottom with:

```md
## Table of contents

By default a `[[_TOC_]]` marker in the README is expanded into an inline table of
contents linking to the project's headings. The `toc` prop overrides this:

- `toc="inline"` — always render the inline TOC, even without a `[[_TOC_]]` marker.
- `toc="sidebar"` — render the README's headings in the page's right-hand sidebar,
  like a normal Docusaurus page (merged with the page's own headings in document
  order). No inline TOC is rendered.
- `toc="hidden"` — never render a TOC; any `[[_TOC_]]` marker is stripped.

```mdx
<GitlabReadme project="group/repo" toc="sidebar" />
```
```

- [ ] **Step 2: Document the attribute in the root README**

In `README.md`, find the `<GitlabReadme>` section/usage and add a sentence plus example documenting the `toc` prop with its three values (`hidden`, `inline`, `sidebar`) and the default (auto / marker-driven). Match the surrounding documentation style. Example to include:

```mdx
<GitlabReadme project="group/repo" toc="sidebar" />
```

- [ ] **Step 3: Verify docs build (optional but recommended)**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS — the example site (which includes `readme.mdx`) still builds.

- [ ] **Step 4: Commit**

```bash
git add README.md examples/site/docs/components/readme.mdx
git commit -m "docs: document the GitlabReadme toc attribute

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run the full unit suite: `npx vitest run` — all pass.
- [ ] Run typecheck: `npm run typecheck` — no errors.
- [ ] Run the build: `npm run build` — compiles clean to `dist/`.
- [ ] Run e2e: `npx vitest run test/e2e/build.test.ts` — passes.
- [ ] Confirm the XSS regression test in `src/gitlab/markdown.test.ts` is green.
