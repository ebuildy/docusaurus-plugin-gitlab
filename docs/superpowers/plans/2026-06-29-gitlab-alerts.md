# GitLab Markdown Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render GitLab Markdown alerts (`> [!note]`, `[!tip]`, `[!important]`, `[!caution]`, `[!warning]`) as themed callout boxes everywhere `renderMarkdown` is used.

**Architecture:** A new rehype plugin `rehypeGitlabAlerts` (in `src/gitlab/alerts.ts`) runs **after** `rehype-sanitize` in the `renderMarkdown` pipeline — the same slot as `rehypeGitlabToc`. It walks `blockquote` nodes, detects a leading `[!type]` marker (case-insensitive, with optional same-line custom title), and rewrites the blockquote into a `<div>` carrying both stable `gitlab-md-alert*` hook classes and Docusaurus/Infima `alert alert--<variant>` classes, with a title paragraph prepended. Post-sanitize execution means injected classes survive and the body is already safe.

**Tech Stack:** TypeScript (ESM, explicit `.js` imports), unified/rehype, `unist-util-visit`, Vitest. No new dependencies.

---

## File Structure

- **Create** `src/gitlab/alerts.ts` — the `rehypeGitlabAlerts` plugin plus pure helpers `ALERT_TYPES` and `buildAlertTitle`.
- **Create** `src/gitlab/alerts.test.ts` — unit/behavior tests via `renderMarkdown`.
- **Modify** `src/gitlab/markdown.ts` — import and `.use(rehypeGitlabAlerts)` after `rehypeGitlabToc`.
- **Modify** `README.md` — document the syntax and add class-table rows.
- **Create** `examples/site/docs/components/alerts.mdx` — example page (rendered via `<GitlabReadme>`/`<GitlabFile>` content; here a static doc page demonstrating the markdown is sufficient).

Reference pattern: `src/gitlab/toc.ts` and `src/gitlab/toc.test.ts`.

---

### Task 1: Plugin scaffold + first passing alert (note)

**Files:**
- Create: `src/gitlab/alerts.ts`
- Create: `src/gitlab/alerts.test.ts`
- Modify: `src/gitlab/markdown.ts`

- [ ] **Step 1: Write the failing test**

Create `src/gitlab/alerts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("rehypeGitlabAlerts", () => {
  it("renders a [!note] blockquote as an Infima alert div", async () => {
    const md = "> [!note]\n> The following information is useful.\n";
    const html = await renderMarkdown(md, {});

    expect(html).toContain(
      'class="gitlab-md-alert gitlab-md-alert--note alert alert--secondary"',
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('<p class="gitlab-md-alert-title">Note</p>');
    expect(html).toContain("<p>The following information is useful.</p>");
    expect(html).not.toContain("[!note]");
    expect(html).not.toContain("<blockquote>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: FAIL — `renderMarkdown` does not yet transform alerts (output still contains `<blockquote>` / `[!note]`).

- [ ] **Step 3: Create the plugin**

Create `src/gitlab/alerts.ts`:

```ts
import type { Root, Element, ElementContent } from "hast";
import { visit } from "unist-util-visit";

interface AlertType {
  defaultTitle: string;
  infimaClass: string;
}

/** GitLab alert type → default title + Docusaurus/Infima theme variant class. */
export const ALERT_TYPES: Record<string, AlertType> = {
  note: { defaultTitle: "Note", infimaClass: "alert--secondary" },
  tip: { defaultTitle: "Tip", infimaClass: "alert--success" },
  important: { defaultTitle: "Important", infimaClass: "alert--info" },
  caution: { defaultTitle: "Caution", infimaClass: "alert--warning" },
  warning: { defaultTitle: "Warning", infimaClass: "alert--danger" },
};

// Leading `[!type]` marker plus an optional same-line custom title.
// `[^\S\r\n]` = horizontal whitespace only (so we never cross into the body line).
const MARKER_RE =
  /^[^\S\r\n]*\[!(note|tip|important|caution|warning)\][^\S\r\n]*([^\r\n]*)/i;

/** Build the `<p class="gitlab-md-alert-title">…</p>` title node. */
export function buildAlertTitle(title: string): Element {
  return {
    type: "element",
    tagName: "p",
    properties: { className: ["gitlab-md-alert-title"] },
    children: [{ type: "text", value: title }],
  };
}

/**
 * Rehype plugin. Must run AFTER rehype-sanitize so the classes/structure it
 * injects are not stripped and the alert body is already sanitized.
 */
export function rehypeGitlabAlerts() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "blockquote") return;

      const para = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "p",
      );
      if (!para) return;

      const first = para.children[0];
      if (!first || first.type !== "text") return;

      const match = MARKER_RE.exec(first.value);
      if (!match) return;

      const type = match[1].toLowerCase();
      const spec = ALERT_TYPES[type];
      if (!spec) return;

      const customTitle = match[2].trim();
      const title = customTitle.length > 0 ? customTitle : spec.defaultTitle;

      // Strip the marker (+ same-line title + the trailing newline) from the body.
      first.value = first.value.slice(match[0].length).replace(/^\r?\n/, "");
      if (first.value.length === 0) para.children.shift();
      if (para.children.length === 0) {
        node.children = node.children.filter((c) => c !== para);
      }

      node.tagName = "div";
      node.properties = {
        className: [
          "gitlab-md-alert",
          `gitlab-md-alert--${type}`,
          "alert",
          spec.infimaClass,
        ],
        role: "alert",
      };
      node.children.unshift(buildAlertTitle(title) as ElementContent);
    });
  };
}
```

- [ ] **Step 4: Wire the plugin into the pipeline**

In `src/gitlab/markdown.ts`, add the import near the existing toc import (line ~10):

```ts
import { rehypeGitlabAlerts } from "./alerts.js";
```

And add the `.use` immediately after `.use(rehypeGitlabToc)` (line ~42):

```ts
    .use(rehypeGitlabToc)
    .use(rehypeGitlabAlerts)
    .use(collect)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/alerts.ts src/gitlab/alerts.test.ts src/gitlab/markdown.ts
git commit -m "feat: render GitLab [!type] blockquote alerts"
```

---

### Task 2: All five types map to correct classes and default titles

**Files:**
- Modify: `src/gitlab/alerts.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe` block in `src/gitlab/alerts.test.ts`:

```ts
  it.each([
    ["note", "alert--secondary", "Note"],
    ["tip", "alert--success", "Tip"],
    ["important", "alert--info", "Important"],
    ["caution", "alert--warning", "Caution"],
    ["warning", "alert--danger", "Warning"],
  ])("maps [!%s] to %s with default title %s", async (type, infima, title) => {
    const html = await renderMarkdown(`> [!${type}]\n> Body text.\n`, {});
    expect(html).toContain(
      `class="gitlab-md-alert gitlab-md-alert--${type} alert ${infima}"`,
    );
    expect(html).toContain(`<p class="gitlab-md-alert-title">${title}</p>`);
    expect(html).toContain("<p>Body text.</p>");
  });
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: PASS (the Task 1 implementation already handles all five types).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/alerts.test.ts
git commit -m "test: cover all five alert types and Infima class mapping"
```

---

### Task 3: Custom title override + empty custom title

**Files:**
- Modify: `src/gitlab/alerts.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe` block:

```ts
  it("uses a same-line custom title when present", async () => {
    const md = "> [!warning] Data deletion\n> This is destructive.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain('class="gitlab-md-alert gitlab-md-alert--warning alert alert--danger"');
    expect(html).toContain('<p class="gitlab-md-alert-title">Data deletion</p>');
    expect(html).toContain("<p>This is destructive.</p>");
    expect(html).not.toContain("Data deletion</p><p>Data deletion");
  });

  it("falls back to the default title when the custom title is blank", async () => {
    const html = await renderMarkdown("> [!tip]   \n> Tip body.\n", {});
    expect(html).toContain('<p class="gitlab-md-alert-title">Tip</p>');
    expect(html).toContain("<p>Tip body.</p>");
  });
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: PASS (the regex captures the custom title; blank trims to the default).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/alerts.test.ts
git commit -m "test: cover custom and blank alert titles"
```

---

### Task 4: Case-insensitive marker matching

**Files:**
- Modify: `src/gitlab/alerts.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe` block:

```ts
  it.each(["[!NOTE]", "[!Note]", "[!nOtE]"])(
    "matches %s case-insensitively and normalizes to note",
    async (marker) => {
      const html = await renderMarkdown(`> ${marker}\n> Body.\n`, {});
      expect(html).toContain(
        'class="gitlab-md-alert gitlab-md-alert--note alert alert--secondary"',
      );
      expect(html).toContain('<p class="gitlab-md-alert-title">Note</p>');
    },
  );
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: PASS (regex has the `i` flag; `type` is lowercased).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/alerts.test.ts
git commit -m "test: cover case-insensitive alert markers"
```

---

### Task 5: Non-transform cases stay plain blockquotes

**Files:**
- Modify: `src/gitlab/alerts.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe` block:

```ts
  it("leaves an unknown alert type as a plain blockquote", async () => {
    const html = await renderMarkdown("> [!foo]\n> Body.\n", {});
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("gitlab-md-alert");
  });

  it("leaves an ordinary blockquote untouched", async () => {
    const html = await renderMarkdown("> Just a quote.\n", {});
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("gitlab-md-alert");
  });

  it("does not transform when the marker is not at the line start", async () => {
    const html = await renderMarkdown("> see [!note] here\n", {});
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("gitlab-md-alert");
  });
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: PASS (`[!foo]` fails the regex; plain quote has no marker; anchored `^` rejects mid-line markers).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/alerts.test.ts
git commit -m "test: leave non-alert blockquotes untouched"
```

---

### Task 6: Edge cases — empty body, rich body, multiple alerts

**Files:**
- Modify: `src/gitlab/alerts.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe` block:

```ts
  it("renders a marker-only alert with no stray empty paragraph", async () => {
    const html = await renderMarkdown("> [!important]\n", {});
    expect(html).toContain('class="gitlab-md-alert gitlab-md-alert--important alert alert--info"');
    expect(html).toContain('<p class="gitlab-md-alert-title">Important</p>');
    expect(html).not.toMatch(/<p><\/p>/);
  });

  it("preserves inline markdown inside the alert body", async () => {
    const md = "> [!note]\n> Read **this** and [docs](https://x.test).\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain("<strong>this</strong>");
    expect(html).toContain('href="https://x.test"');
  });

  it("transforms multiple alerts in one document independently", async () => {
    const md = "> [!tip]\n> First.\n\n> [!warning]\n> Second.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain("gitlab-md-alert--tip");
    expect(html).toContain("gitlab-md-alert--warning");
    expect(html).toContain("<p>First.</p>");
    expect(html).toContain("<p>Second.</p>");
  });
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: PASS (empty paragraph is dropped; body nodes are preserved; `visit` handles every blockquote).

- [ ] **Step 3: Commit**

```bash
git add src/gitlab/alerts.test.ts
git commit -m "test: cover empty-body, rich-body, and multiple alerts"
```

---

### Task 7: Security — XSS in title escaped + coexistence with TOC

**Files:**
- Modify: `src/gitlab/alerts.test.ts`

- [ ] **Step 1: Write the failing test**

Add inside the `describe` block:

```ts
  it("escapes HTML in a custom title and runs no handlers", async () => {
    const md = '> [!warning] <img src=x onerror="alert(1)">\n> Body.\n';
    const html = await renderMarkdown(md, {});
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
    // Title text is inserted as an escaped text node.
    expect(html).toContain("gitlab-md-alert-title");
  });

  it("applies both the TOC and alert transforms in one document", async () => {
    const md = "[[_TOC_]]\n\n## Heading\n\n> [!note]\n> Note body.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain('<nav class="gitlab-md-toc">');
    expect(html).toContain("gitlab-md-alert--note");
  });
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/gitlab/alerts.test.ts`
Expected: PASS. Note: the raw `<img>` in the title is sanitized away *before* our plugin runs, and whatever leading text remains is re-emitted as an escaped text node, so no handler survives.

- [ ] **Step 3: Run the full suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS (no regressions, including the existing `markdown.test.ts` XSS test).

- [ ] **Step 4: Commit**

```bash
git add src/gitlab/alerts.test.ts
git commit -m "test: escape XSS in alert titles and coexist with TOC"
```

---

### Task 8: Documentation

**Files:**
- Modify: `README.md`
- Create: `examples/site/docs/components/alerts.mdx`

- [ ] **Step 1: Add the alerts note to the `<GitlabReadme>` section**

In `README.md`, immediately after the `[[_TOC_]]` blockquote note (ends at line ~118), add:

```markdown

> **Alerts:** GitLab alert blockquotes are rendered as themed callouts. A blockquote
> whose first line is `> [!note]`, `> [!tip]`, `> [!important]`, `> [!caution]`, or
> `> [!warning]` becomes a `<div>` carrying both `gitlab-md-alert*` hook classes and
> the Docusaurus/Infima `alert alert--<variant>` classes (so it inherits theme colors).
> Type matching is case-insensitive; add text after the marker for a custom title, e.g.
> `> [!warning] Data deletion`. This also works for `<GitlabFile>` markdown and release notes.
```

- [ ] **Step 2: Add class-table rows**

In `README.md`, after the `gitlab-md-toc` row (line ~235), add:

```markdown
| `gitlab-md-alert` / `gitlab-md-alert--<type>` | alert callout container + per-type modifier (also gets Infima `alert alert--<variant>`) |
| `gitlab-md-alert-title` | alert title row |
```

- [ ] **Step 3: Create the example page**

Create `examples/site/docs/components/alerts.mdx`:

```mdx
---
title: Markdown alerts
---

# Markdown alerts

GitLab alert blockquotes embedded via `<GitlabReadme>` or `<GitlabFile>` render as
themed callouts. The source markdown looks like this:

```markdown
> [!note]
> The following information is useful.

> [!tip]
> Tip of the day.

> [!important]
> This is something important you should know.

> [!caution]
> You need to be very careful about the following.

> [!warning] Data deletion
> The following instructions will make your data unrecoverable.
```

Type matching is case-insensitive, and any text after the marker becomes a custom title.
```

- [ ] **Step 4: Verify docs build is unaffected**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md examples/site/docs/components/alerts.mdx
git commit -m "docs: document GitLab markdown alerts"
```

---

## Self-Review Notes

- **Spec coverage:** five types (Tasks 1–2), case-insensitivity (Task 4), custom/blank titles (Task 3), Infima + hook classes (Tasks 1–2), pipeline wiring post-sanitize (Task 1), security/XSS + TOC coexistence (Task 7), edge cases incl. marker-only/rich body/multiple/non-transform (Tasks 5–6), docs + class table + example page (Task 8). `>>>` is explicitly out of scope per the spec.
- **No placeholders:** every code and test step is complete and copy-pasteable.
- **Type consistency:** `ALERT_TYPES`, `buildAlertTitle`, `rehypeGitlabAlerts`, and the four-class output (`gitlab-md-alert`, `gitlab-md-alert--<type>`, `alert`, `alert--<variant>`) are used identically across all tasks.
```
