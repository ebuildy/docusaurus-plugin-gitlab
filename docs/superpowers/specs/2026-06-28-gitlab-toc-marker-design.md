# Design: Generate a real TOC for GitLab `[[_TOC_]]` markers

Date: 2026-06-28
Status: Approved

## Problem

GitLab Flavored Markdown supports a `[[_TOC_]]` marker that GitLab expands into a
table of contents. When such markdown (README, an embedded `.md`/`.mdx` file, or a
release note) is rendered by this plugin into a Docusaurus page, the marker is *not*
understood — it renders as the literal text `[[_TOC_]]`. We must detect the marker
and replace it with a real, generated table of contents linking to the document's
headings.

## Scope decisions

- **Marker recognized:** `[[_TOC_]]` only (GitLab's official marker). The
  `_TOC_` token is matched case-insensitively (`[[_toc_]]` also works). The legacy
  `[TOC]` and the `[[TOC]]` variant are intentionally **not** supported.
- **Heading depth:** the TOC includes `h2` to `h5` only (sidebar-style depth).
  `h1` (typically the document title) and `h6` are excluded.
- **Heading ids:** slug `id`s are added to headings **only when a `[[_TOC_]]` marker
  is present** in that document. Documents without the marker are rendered exactly as
  before (no ids added).

## Architecture

All markdown in this package flows through a single function,
`renderMarkdown` (`src/gitlab/markdown.ts`), used by `fetchReadme`, `fetchFile`, and
the release-notes path in `src/gitlab/fetchers.ts`. The TOC feature is implemented
as one rehype plugin inserted into that shared pipeline, so all three call sites gain
support with no call-site changes.

Pipeline (new step in **bold**):

```
remarkParse → remarkGfm → remarkRehype(allowDangerousHtml) → rehypeRaw
  → rehypeSanitize → **rehypeGitlabToc** → collect → rehypeStringify
```

The plugin runs **after `rehypeSanitize`**. This is deliberate: `rehype-sanitize`'s
default schema clobbers `id` attributes (prefixing `user-content-`). By slugging
headings and generating the TOC after sanitize, the heading `id`s and the TOC
`href="#…"` anchors stay consistent with each other. The nodes the plugin emits are
constructed from extracted **text** only (heading text → text nodes; slugs →
`id`/`href`), so running after sanitize does not reopen an XSS surface.

## New module

`src/gitlab/toc.ts` exporting a rehype plugin `rehypeGitlabToc()`.

## New dependencies

- `github-slugger` — slug generation (same slugger Docusaurus uses, so anchors feel
  native). Pure ESM.
- `hast-util-to-string` — extract a heading's plain-text content. Pure ESM.

Both satisfy the package's ESM-only constraint.

## Algorithm

1. **Detect the marker.** Walk the hast tree for a `<p>` element whose trimmed text
   content equals `[[_TOC_]]` (case-insensitive on `_TOC_`). Record the node and its
   parent + index. If no such paragraph exists, return the tree unchanged — no
   slugging, no TOC (preserves the scoped-ids decision).
2. **Slug headings.** With a marker present, walk all `h2`–`h5` elements in document
   order. For each, derive text via `hast-util-to-string`, generate a unique slug
   with a single shared `GithubSlugger` instance, and set `properties.id`. Do **not**
   overwrite an author-supplied `id` if one already exists (still feed its text to the
   slugger so later slugs dedupe correctly).
3. **Build the TOC.** From the ordered `h2`–`h5` list, build a list nested by heading
   level. Walk the headings in document order keeping a stack of the currently open
   `<ul>` per level: a heading deeper than the previous opens nested `<ul>`s; a
   shallower one pops back up. Each entry is `<li><a href="#slug">{text}</a></li>`.
   The shallowest heading present anchors the top level, so a document whose headings
   start at `h3` still produces a sensible top-level list (levels are relative, not
   absolute to `h2`).
4. **Replace in place.** Replace the marker `<p>` node with
   `<nav class="gitlab-md-toc"><ul>…</ul></nav>`.

## Edge cases

- **Marker present, no `h2`/`h5` headings** → remove the marker paragraph entirely
  (replace with nothing); a stray `[[_TOC_]]` must never render as literal text.
- **Inline marker** (e.g. `foo [[_TOC_]] bar` within a paragraph of other text) → not
  treated as a TOC; only a paragraph whose *entire* trimmed text is the marker
  qualifies. Matches GitLab (marker honored only on its own line). Left as literal
  text.
- **Multiple markers** → every qualifying marker paragraph is replaced; headings are
  slugged once. (GitLab honors only the first; replacing all is harmless and simpler.
  Noted divergence.)
- **Duplicate heading text** → `GithubSlugger` auto-dedupes (`install`, `install-1`,
  …). Because the same slugger instance produces both the heading `id` and the TOC
  `href`, links stay correct.
- **Pre-existing heading `id`** → respected, not overwritten.
- **Case** → `[[_toc_]]`, `[[_TOC_]]`, etc. all match.

## Styling

Rendered markdown is injected via `dangerouslySetInnerHTML`, so CSS-module class
hashing does not apply. The plugin emits a stable plain class `gitlab-md-toc` on the
`<nav>`. No CSS is shipped by default — the list inherits Docusaurus styling and the
class is available for users to target. The class will be documented in the README.

## Security

The plugin runs after `rehypeSanitize` but emits only hast nodes constructed from
extracted text. No raw HTML passes through it. The existing XSS regression test in
`src/gitlab/markdown.test.ts` stays green, and a new test asserts that a `[[_TOC_]]`
document whose headings contain malicious markup still yields a clean, escaped TOC.

## Testing (TDD)

New `src/gitlab/toc.test.ts` driving `renderMarkdown`:

- marker + `## A` / `### B` → `<nav class="gitlab-md-toc">` containing `<a href="#a">`
  and a nested `<a href="#b">`; the `h2`–`h5` get matching `id`s.
- deep nesting: `## A` / `### B` / `#### C` / `##### D` → correctly nested `<ul>`s,
  one level per heading depth.
- no marker → headings receive **no** `id` (scoped behavior preserved).
- duplicate heading text → deduped slugs in both ids and hrefs.
- marker present, no headings → marker paragraph removed, no leftover literal text.
- inline `[[_TOC_]]` inside a sentence → left untouched as literal text.
- XSS: heading text containing `<img onerror=…>` / script → TOC link text escaped, no
  handler or script in output.

## Out of scope (YAGNI)

- Configurable heading depth or marker syntax (hardcoded `h2`–`h5`, `[[_TOC_]]`).
- Default CSS styling for the TOC.
- A standalone `<GitlabToc>` component (the marker-in-markdown flow covers the need).
