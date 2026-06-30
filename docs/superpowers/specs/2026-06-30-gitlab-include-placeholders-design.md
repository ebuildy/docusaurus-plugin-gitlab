# GitLab include placeholders — design

Date: 2026-06-30
Status: Approved (v1)

## Problem

The current `GitlabReadme` (and `GitlabFile`) JSX components render GitLab markdown
**outside** Docusaurus. The remark plugin fetches the README, runs it through this
package's own `renderMarkdown` (unified) pipeline into sanitized HTML, and injects it as
a `data` prop that the component dumps via `dangerouslySetInnerHTML`.

Consequences:

- Emoji (`:rocket:`), admonitions, and other Docusaurus markdown features do **not** work
  on embedded content — Docusaurus never sees it as markdown.
- Sidebar TOC entries had to be hand-synthesized (`src/remark/toc-export.ts`,
  `src/remark/toc-merge.ts`) because Docusaurus never extracts headings from the embed.
- Prism highlighting, heading anchors, and internal-link resolution don't apply to the
  embedded content.

## Goal

Add **build-time markdown placeholders** that splice GitLab content into the host document
as **source text before MDX parsing**, so Docusaurus's own pipeline (TOC, emoji,
admonitions, heading anchors, Prism, internal links) processes it natively.

```text
{@includeGitlabReadme: g/sub/project}
{@includeGitlabReadme: ref@g/sub/project}
{@includeGitlabFile: g/sub/project/-/path/file.md}
{@includeGitlabFile: ref@g/sub/project/-/src/foo.ts#L10-25}
```

This is **additive**: the existing remark plugin and all five JSX components
(`GitlabProjectInfo`, `GitlabReadme`, `GitlabReleases`, `GitlabIssues`, `GitlabFile`) stay.
The placeholder path is the preferred route for markdown-shaped content going forward.

## Why a webpack loader (constraint-driven)

The `{@includeGitlabReadme: g/p}` syntax forces a **pre-parse, textual** stage:

- In an `.mdx` file, `{...}` is a JS expression; `{@includeGitlabReadme: g/p}` is invalid
  JS, so **MDX throws a parse error before any remark plugin runs**. A remark plugin cannot
  handle this syntax.
- Docusaurus 3's `markdown.preprocessor` runs before parsing but is **synchronous**; GitLab
  fetching is **async**.
- A **webpack loader** is the one pre-parse hook that supports `this.async()`.

This mirrors `docusaurus-plugin-includes`, which also uses a webpack loader for the same
reason (it embeds local files; we embed remote GitLab content).

## Architecture

A new **Docusaurus plugin** (default export, `src/plugin/index.ts`) that:

1. In `configureWebpack`, registers an **async webpack loader** on `.md(x)` files.
2. Auto-registers the existing `remarkGitlab` remark plugin and the `theme.css`, so users
   add a **single** `plugins` entry and get both placeholders and JSX components
   (packaging decision: "one plugin does both").

**Integration risk to verify first:** Docusaurus exposes clean hooks for the webpack loader
(`configureWebpack`) and `theme.css` (`getThemePath` / `injectHtmlTags`), but there is **no
first-class API for one plugin to inject a remark plugin into content-docs' MDX config**.
The first implementation task must confirm whether `remarkGitlab` can be auto-registered
site-wide. If not, the fallback: the plugin auto-wires the **loader + theme**, and the
`remarkGitlab` registration stays a documented one-line addition to the preset's
`remarkPlugins`. The placeholder feature itself does not depend on this.

The loader builds the GitLab context (`GitLabClient` + `FileCache` + `AssetManager`) once as
a module-level singleton keyed by resolved options. Webpack loader options must be
serializable, so the loader receives plain config (`host`, `token`, cache/asset settings)
and constructs the context itself, mirroring `buildContext` in `src/remark/index.ts`.

```text
webpack .md(x) load
  └─ gitlab-include loader (async)
       ├─ cheap guard: skip files with no "{@includeGitlab" match
       ├─ for each placeholder: parse grammar → fetch RAW markdown/file (cache)
       ├─ strip frontmatter · rewrite+localize images/links · MDX-escape prose
       ├─ (file mode) wrap non-markdown in ```lang fence
       └─ textual substitution → hand source to MDX
  └─ MDX/remark/rehype: TOC, emoji, admonitions, Prism — all native
```

Target files: apply the loader to `.md(x)` (replicating the content-docs include paths as
`docusaurus-plugin-includes` does, broadened to blog/pages where practical). The
`{@includeGitlab` regex guard is the real filter, so non-matching files pass through
untouched and cheaply.

## Grammar & parsing — `src/include/grammar.ts`

A focused, unit-tested parser. Form:

```text
[ref@]group/.../project[/-/path][#Lstart-end]
```

- **`ref@`** optional prefix → git ref (branch/tag/sha). Default = project default branch.
- **`/-/`** separates project from file path (GitLab-native, unambiguous with nested
  subgroups).
- **`#Lstart-end`** optional line range (file mode only); reuses the existing line-slice
  logic from `GitlabFile`.
- `includeGitlabReadme` takes no `/-/path`; `includeGitlabFile` requires one.
- Malformed placeholder → build error when `strict`, else an inline
  `> ⚠️ ...` blockquote warning (mirrors the remark plugin's error policy).

## Content processing — `src/include/render-source.ts`

Today `renderMarkdown` does: raw md → URL-rewrite/localize → sanitized **HTML**. For the
placeholder path we factor the URL/asset step to operate at the **markdown level** and add
an MDX-safety step, producing **markdown text** (not HTML):

1. **Strip leading frontmatter** from fetched content so it doesn't collide with the host
   doc's frontmatter.
2. **Localize images** via the existing `AssetManager` (downloads to the static dir; works
   for private repos / offline); **absolutize repo-relative links** to GitLab web URLs.
3. **MDX-safe escape**: neutralize stray `{`/`}` and JSX-like `<…>` in prose, **leaving
   fenced and inline code untouched**. This is the new trust boundary for the placeholder
   path.
4. **File mode by extension**: `.md` / `.mdx` / `.markdown` → injected as markdown;
   everything else → wrapped in a ` ```<lang> ` fence with language inferred from the
   extension.

Raw-content fetch: add `fetchReadmeSource` / `fetchFileSource` that return **raw markdown /
file text** (distinct from the existing HTML-producing `fetchReadme` / `fetchFile`), both
memoized through `FileCache`. Multiple host docs including the same resource hit the cache.

## Error handling

- Reuse the `strict` policy from `resolveOptions` (throw in production, inline warning in
  development).
- Fetch failures and malformed placeholders are reported with the host file path and, where
  available, the placeholder text.

## Security

- The **MDX-safe escape** pass (step 3 above) is the trust boundary for embedded remote
  content. It must:
  - neutralize stray `{`/`}` and JSX-like `<…>` in prose so a hostile or accidentally
    malformed README cannot break the build or inject components;
  - leave fenced/inline code verbatim.
- Unit-tested with hostile input (stray braces, `<script>`, `<Component>`), analogous to the
  existing `src/gitlab/markdown.test.ts` XSS test.

## Testing

- **Grammar parser**: table-driven (ref present/absent, nested groups, `/-/` path, line
  range, readme-vs-file, malformed).
- **render-source**: frontmatter strip, image localize, link absolutize, MDX escape (incl.
  code-fence survival), fence-by-extension.
- **Loader**: regex guard skips non-matching files, multiple placeholders in one file, cache
  dedup, malformed → error (strict) / inline warning (dev).
- **e2e** (`examples/`): a page using both placeholders, asserting native TOC entries,
  rendered emoji, and Prism-highlighted code appear in the built HTML.

## Out of scope (v1)

- **Heading-level shift.** An included `# Title` produces an `<h1>` inside a page that
  already has one (multiple h1s / TOC noise). v1 default: **no shift**. An optional
  `headingShift` may be added later.
- `src/remark/toc-export.ts` / `src/remark/toc-merge.ts` remain unchanged — the JSX
  `GitlabReadme` still needs them. The placeholder path does not use them (TOC is native).

## Module map (new/changed)

| File | Responsibility |
|---|---|
| `src/plugin/index.ts` | New Docusaurus plugin: `configureWebpack` registers the loader; auto-registers `remarkGitlab` + `theme.css` |
| `src/include/loader.ts` | Async webpack loader: guard, parse, fetch, process, substitute |
| `src/include/grammar.ts` | Placeholder grammar parser |
| `src/include/render-source.ts` | Raw-markdown processing: frontmatter strip, asset/link rewrite, MDX-safe escape, fence-by-extension |
| `src/gitlab/fetchers.ts` | Add `fetchReadmeSource` / `fetchFileSource` (raw text, memoized) |
| `src/index.ts` | Export the Docusaurus plugin as default |
