# GitLab `[[_TOC_]]` Marker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect GitLab's `[[_TOC_]]` marker in rendered markdown (README, embedded `.md`/`.mdx` files, release notes) and replace it with a real, generated table of contents linking to the document's `h2`–`h5` headings.

**Architecture:** All markdown flows through one function, `renderMarkdown` (`src/gitlab/markdown.ts`). We (1) pre-process the raw markdown to replace standalone `[[_TOC_]]` lines with a collision-safe placeholder token, then (2) add a rehype plugin **after `rehypeSanitize`** that slugs the `h2`–`h5` headings, builds a nested `<nav>`/`<ul>` TOC, and swaps the placeholder paragraph for it. Pre-processing avoids a parsing trap: `[[_TOC_]]` renders to `<p>[[<em>TOC</em>]]</p>` (the underscores become emphasis), so it cannot be matched reliably in the hast tree — but `GITLAB_MD_TOC_PLACEHOLDER` passes through untouched (intraword underscores are not emphasis).

**Tech Stack:** TypeScript (ESM, `.js` import extensions), unified/rehype, `github-slugger`, `hast-util-to-string`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-28-gitlab-toc-marker-design.md`

---

## File Structure

- **Create** `src/gitlab/toc.ts` — the `rehypeGitlabToc` plugin, the exported `TOC_PLACEHOLDER` token, and the `buildToc` helper. One responsibility: turn a slugged heading list + a placeholder paragraph into a TOC.
- **Create** `src/gitlab/toc.test.ts` — behavior tests driving the public `renderMarkdown`.
- **Modify** `src/gitlab/markdown.ts` — add the pre-process step and wire the plugin into the pipeline.
- **Modify** `package.json` — add two runtime dependencies.
- **Modify** `README.md` and `theme.css` — document the `gitlab-md-toc` class and ship an optional style rule.

---

## Task 1: Add dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the two ESM packages**

Run:
```bash
npm install github-slugger hast-util-to-string
```
Expected: both appear under `"dependencies"` in `package.json`; install succeeds.

- [ ] **Step 2: Verify they are pure ESM (no CJS build allowed in this package)**

Run:
```bash
node -e "const a=require('./node_modules/github-slugger/package.json');const b=require('./node_modules/hast-util-to-string/package.json');console.log('github-slugger type:',a.type);console.log('hast-util-to-string type:',b.type);"
```
Expected: both print `type: module`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add github-slugger and hast-util-to-string deps"
```

---

## Task 2: TOC plugin + pipeline wiring (basic case)

**Files:**
- Create: `src/gitlab/toc.ts`
- Create: `src/gitlab/toc.test.ts`
- Modify: `src/gitlab/markdown.ts`

- [ ] **Step 1: Write the failing test**

Create `src/gitlab/toc.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("rehypeGitlabToc", () => {
  it("replaces [[_TOC_]] with a nav listing h2/h3 headings", async () => {
    const md = "[[_TOC_]]\n\n## Install\n\n### Steps\n";
    const html = await renderMarkdown(md, {});

    expect(html).toContain('<nav class="gitlab-md-toc">');
    expect(html).toContain('<a href="#install">Install</a>');
    expect(html).toContain('<a href="#steps">Steps</a>');
    expect(html).toContain('<h2 id="install">');
    expect(html).toContain('<h3 id="steps">');
    expect(html).not.toContain("[[_TOC_]]");
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: FAIL — output contains the literal marker / no `<nav class="gitlab-md-toc">`.

- [ ] **Step 3: Create the plugin module**

Create `src/gitlab/toc.ts`:
```ts
import type { Root, Element, RootContent } from "hast";
import GithubSlugger from "github-slugger";
import { toString } from "hast-util-to-string";
import { visit } from "unist-util-visit";

/**
 * Token we substitute for a standalone `[[_TOC_]]` line BEFORE markdown parsing.
 * Underscores inside a word are not emphasis, so this survives the pipeline
 * intact as plain paragraph text — unlike `[[_TOC_]]`, whose underscores would
 * be parsed into `<em>`.
 */
export const TOC_PLACEHOLDER = "GITLAB_MD_TOC_PLACEHOLDER";

const HEADING_LEVELS: Record<string, number> = { h2: 2, h3: 3, h4: 4, h5: 5 };

interface TocEntry {
  level: number;
  id: string;
  text: string;
}

/**
 * Rehype plugin. Must run AFTER rehype-sanitize so the ids/anchors it generates
 * are not clobbered by the sanitize schema. No-op unless a placeholder paragraph
 * is present (keeps heading-id injection scoped to documents that use the marker).
 */
export function rehypeGitlabToc() {
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
    if (placeholders.length === 0) return;

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

    const nav = buildToc(entries);

    // Splice back-to-front so earlier indices stay valid.
    for (const { parent, index } of placeholders.reverse()) {
      if (nav) {
        parent.children.splice(index, 1, structuredClone(nav) as RootContent);
      } else {
        parent.children.splice(index, 1);
      }
    }
  };
}

/** Build a `<nav><ul>…</ul></nav>` nested by heading level, or null if empty. */
export function buildToc(entries: TocEntry[]): Element | null {
  if (entries.length === 0) return null;
  const minLevel = Math.min(...entries.map((e) => e.level));

  const rootList: Element = { type: "element", tagName: "ul", properties: {}, children: [] };
  const stack: { level: number; list: Element }[] = [{ level: minLevel, list: rootList }];

  for (const entry of entries) {
    const li: Element = {
      type: "element",
      tagName: "li",
      properties: {},
      children: [
        {
          type: "element",
          tagName: "a",
          properties: { href: `#${entry.id}` },
          children: [{ type: "text", value: entry.text }],
        },
      ],
    };

    while (stack.length > 1 && stack[stack.length - 1].level > entry.level) {
      stack.pop();
    }
    let top = stack[stack.length - 1];

    if (entry.level > top.level) {
      const lastLi = top.list.children[top.list.children.length - 1];
      const nestedUl: Element = { type: "element", tagName: "ul", properties: {}, children: [] };
      if (lastLi && lastLi.type === "element" && lastLi.tagName === "li") {
        lastLi.children.push(nestedUl);
      } else {
        top.list.children.push(nestedUl);
      }
      stack.push({ level: entry.level, list: nestedUl });
      top = stack[stack.length - 1];
    }

    top.list.children.push(li);
  }

  return {
    type: "element",
    tagName: "nav",
    properties: { className: ["gitlab-md-toc"] },
    children: [rootList],
  };
}
```

- [ ] **Step 4: Wire the plugin and pre-process into `renderMarkdown`**

In `src/gitlab/markdown.ts`, add the import near the other `./`-imports (note the `.js` extension, required by this package's ESM setup):
```ts
import { rehypeGitlabToc, TOC_PLACEHOLDER } from "./toc.js";
```

Add this module-level constant just below the imports (a standalone `[[_TOC_]]` line, allowing leading/trailing spaces/tabs):
```ts
const TOC_MARKER_RE = /^[^\S\r\n]*\[\[_TOC_\]\][^\S\r\n]*$/gim;
```

Replace the body of `renderMarkdown` so the source is pre-processed and the plugin is inserted **after** `rehypeSanitize`:
```ts
export async function renderMarkdown(md: string, opts: RenderOptions): Promise<string> {
  const source = md.replace(TOC_MARKER_RE, TOC_PLACEHOLDER);

  const transforms: { el: Element; attr: "src" | "href"; fn: (v: string) => Promise<string> }[] = [];

  const collect = () => (tree: Root) => {
    visit(tree, "element", (el: Element) => {
      if (el.tagName === "img" && opts.transformImageSrc && typeof el.properties?.src === "string") {
        transforms.push({ el, attr: "src", fn: opts.transformImageSrc });
      }
      if (el.tagName === "a" && opts.transformLinkHref && typeof el.properties?.href === "string") {
        transforms.push({ el, attr: "href", fn: opts.transformLinkHref });
      }
    });
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(rehypeGitlabToc)
    .use(collect)
    .use(rehypeStringify);

  const tree = processor.parse(source);
  const hast = (await processor.run(tree)) as unknown as Root;

  await Promise.all(
    transforms.map(async (t) => {
      const current = t.el.properties![t.attr] as string;
      t.el.properties![t.attr] = await t.fn(current);
    }),
  );

  return processor.stringify(hast as never);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/toc.ts src/gitlab/toc.test.ts src/gitlab/markdown.ts
git commit -m "feat: render GitLab [[_TOC_]] marker as a real table of contents"
```

---

## Task 3: Scoped heading ids (no marker → no ids)

**Files:**
- Test: `src/gitlab/toc.test.ts`

- [ ] **Step 1: Add the failing/characterization test**

Append inside the `describe` block in `src/gitlab/toc.test.ts`:
```ts
  it("does not add heading ids when no [[_TOC_]] marker is present", async () => {
    const html = await renderMarkdown("## Install\n\n### Steps\n", {});
    expect(html).toContain("<h2>Install</h2>");
    expect(html).toContain("<h3>Steps</h3>");
    expect(html).not.toContain("id=");
    expect(html).not.toContain("gitlab-md-toc");
  });
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: PASS (the plugin returns early when no placeholder exists).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/toc.test.ts
git commit -m "test: heading ids stay scoped to documents with a TOC marker"
```

---

## Task 4: Deep multi-level nesting (h2–h5)

**Files:**
- Test: `src/gitlab/toc.test.ts`

- [ ] **Step 1: Add the test**

Append inside the `describe` block:
```ts
  it("nests h2-h5 headings by depth", async () => {
    const md = "[[_TOC_]]\n\n## A\n\n### B\n\n#### C\n\n##### D\n\n## E\n";
    const html = await renderMarkdown(md, {});

    // All four nested levels are linked.
    expect(html).toContain('<a href="#a">A</a>');
    expect(html).toContain('<a href="#b">B</a>');
    expect(html).toContain('<a href="#c">C</a>');
    expect(html).toContain('<a href="#d">D</a>');
    expect(html).toContain('<a href="#e">E</a>');

    // A's entry opens a nested list before E (a sibling) appears.
    const navStart = html.indexOf('<nav class="gitlab-md-toc">');
    const nav = html.slice(navStart, html.indexOf("</nav>", navStart));
    expect(nav.indexOf("#b")).toBeGreaterThan(nav.indexOf("#a"));
    expect(nav.indexOf("#e")).toBeGreaterThan(nav.indexOf("#d"));
    // Nested <ul> exists for the descent A -> B.
    expect(nav).toContain("<ul><li><a href=\"#a\">A</a><ul>");
  });
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: PASS. If the final `toContain` assertion is brittle against the exact serialization, relax it to `expect(nav).toMatch(/#a<\/a><ul>/)` and re-run — the intent is "B's list is nested inside A's `<li>`".

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/toc.test.ts
git commit -m "test: TOC nests h2-h5 headings by depth"
```

---

## Task 5: Duplicate heading slugs are deduped

**Files:**
- Test: `src/gitlab/toc.test.ts`

- [ ] **Step 1: Add the test**

Append inside the `describe` block:
```ts
  it("dedupes slugs for duplicate heading text", async () => {
    const md = "[[_TOC_]]\n\n## Setup\n\n## Setup\n";
    const html = await renderMarkdown(md, {});

    expect(html).toContain('<h2 id="setup">');
    expect(html).toContain('<h2 id="setup-1">');
    expect(html).toContain('<a href="#setup">Setup</a>');
    expect(html).toContain('<a href="#setup-1">Setup</a>');
  });
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: PASS (the shared `GithubSlugger` instance produces `setup`, then `setup-1`).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/toc.test.ts
git commit -m "test: duplicate headings get deduped TOC slugs"
```

---

## Task 6: Edge cases — no headings, inline marker

**Files:**
- Test: `src/gitlab/toc.test.ts`

- [ ] **Step 1: Add both tests**

Append inside the `describe` block:
```ts
  it("removes the marker entirely when there are no h2-h5 headings", async () => {
    const html = await renderMarkdown("[[_TOC_]]\n\njust a paragraph\n", {});
    expect(html).toContain("<p>just a paragraph</p>");
    expect(html).not.toContain("gitlab-md-toc");
    expect(html).not.toContain("[[_TOC_]]");
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
  });

  it("leaves an inline [[_TOC_]] inside a sentence untouched", async () => {
    const html = await renderMarkdown("see the [[_TOC_]] below\n\n## Install\n", {});
    expect(html).not.toContain("gitlab-md-toc");
    // Inline marker was not pre-processed; it renders as ordinary markdown.
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
    expect(html).toContain("<h2>Install</h2>"); // no marker line => no id slugging
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: PASS. (No-headings: `buildToc` returns null, the placeholder paragraph is removed. Inline: `TOC_MARKER_RE` only matches whole lines, so no placeholder is created and the plugin is a no-op.)

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/toc.test.ts
git commit -m "test: TOC handles empty docs and inline markers"
```

---

## Task 7: Security — malicious heading text stays escaped

**Files:**
- Test: `src/gitlab/toc.test.ts`

- [ ] **Step 1: Add the test**

Append inside the `describe` block:
```ts
  it("escapes heading text and drops handlers in the generated TOC", async () => {
    const md = '[[_TOC_]]\n\n## <img src="x" onerror="alert(1)">Danger\n';
    const html = await renderMarkdown(md, {});

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
    // TOC link text is the heading's plain text, anchored to its slug.
    expect(html).toContain('<a href="#danger">Danger</a>');
  });
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/gitlab/toc.test.ts`
Expected: PASS. `rehype-sanitize` strips `onerror` before our plugin runs; `hast-util-to-string` yields `"Danger"`; the TOC link text is a hast text node (serialized escaped by `rehype-stringify`).

- [ ] **Step 3: Confirm the existing XSS regression test is still green**

Run: `npx vitest run src/gitlab/markdown.test.ts`
Expected: PASS (all existing cases, including the raw-HTML sanitize regression).

- [ ] **Step 4: Commit**

```bash
git add src/gitlab/toc.test.ts
git commit -m "test: TOC keeps malicious heading text escaped"
```

---

## Task 8: Documentation

**Files:**
- Modify: `README.md`
- Modify: `theme.css`
- Modify: `examples/site/docs/components/readme.mdx`

- [ ] **Step 1: Document the feature under `<GitlabReadme>` in README**

In `README.md`, immediately after the `<GitlabReadme>` prop table (the lines ending at `| `ref` | string | default branch | Branch, tag, or commit SHA |`), add:
```markdown

> **Table of contents:** if the README contains a GitLab `[[_TOC_]]` marker on its
> own line, it is replaced at build time with a generated table of contents linking
> to the document's `h2`–`h5` headings (which receive slug `id`s). This also works
> for markdown embedded via `<GitlabFile>` and for release notes.
```

- [ ] **Step 2: Add the class to the README styling table**

In `README.md`, in the class table under `## Styling`, add a row right after the `gitlab-readme` row:
```markdown
| `gitlab-md-toc` | generated `[[_TOC_]]` table of contents (`<nav>`) |
```

- [ ] **Step 3: Add an optional style rule to the shipped theme**

Append to `theme.css`:
```css
/* Generated [[_TOC_]] table of contents */
.gitlab-md-toc ul {
  margin: 0;
  padding-left: 1.25rem;
}
.gitlab-md-toc > ul {
  padding-left: 0;
  list-style: none;
}
```

- [ ] **Step 4: Add a TOC example to the e2e example site**

Append to `examples/site/docs/components/readme.mdx`:
```markdown

## Table of contents

A `[[_TOC_]]` marker in the README is expanded into a real table of contents
linking to the project's headings.
```

- [ ] **Step 5: Lint the markdown**

Run: `npm run lint:md`
Expected: PASS (no markdownlint errors in the edited files).

- [ ] **Step 6: Commit**

```bash
git add README.md theme.css examples/site/docs/components/readme.mdx
git commit -m "docs: document [[_TOC_]] support and gitlab-md-toc class"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors.

- [ ] **Step 2: Run the whole unit suite**

Run: `npm run test`
Expected: PASS, including `packaging.test.ts` (guards the ESM-only build), `markdown.test.ts`, and the new `toc.test.ts`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds; `dist/gitlab/toc.js` and `dist/gitlab/toc.d.ts` are emitted.

- [ ] **Step 4: (Optional, slow ~1 min) Run the e2e Docusaurus build**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS — confirms the new pipeline step builds a real site without SSR errors.

- [ ] **Step 5: Final commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "chore: verification fixups for [[_TOC_]] support"
```

---

## Self-Review Notes

- **Spec coverage:** marker `[[_TOC_]]` only (Task 2 regex) ✓; case-insensitive (`gim` flag) ✓; `h2`–`h5` depth (Task 2 `HEADING_LEVELS`, Task 4) ✓; ids only when marker present (Task 2 early return, Task 3) ✓; after-sanitize ordering (Task 2 wiring) ✓; new module `src/gitlab/toc.ts` ✓; both deps (Task 1) ✓; multi-level nesting (Task 4) ✓; no-headings removal, inline marker, multiple markers (Task 6 + reverse-splice loop) ✓; dedupe (Task 5) ✓; pre-existing id respected (Task 2 `existing` branch) ✓; `gitlab-md-toc` class + styling docs (Task 8) ✓; security (Task 7) ✓; all six spec test cases mapped to Tasks 2–7 ✓.
- **Placeholder scan:** no TBD/TODO; every code step shows full code.
- **Type consistency:** `TOC_PLACEHOLDER`, `rehypeGitlabToc`, `buildToc`, `TocEntry`, `HEADING_LEVELS` named identically across the plugin and the wiring; the placeholder string in `markdown.ts` is imported, not duplicated.
- **Divergence note (from spec):** multiple markers are all replaced (GitLab honors only the first) — implemented intentionally via the reverse-splice loop in Task 2.
