# Design: configurable TOC placement for `<GitlabReadme>`

## Summary

Add a `toc` attribute to `<GitlabReadme>` that controls where the README's table
of contents renders:

- **hide** the TOC,
- show it **inline** (today's behavior), or
- show it in the **right page sidebar**, like a normal Docusaurus page.

All work happens at build time in the existing remark pipeline. The rendered
README HTML and the pure React component are unchanged; the sidebar is populated
by augmenting the page's native `toc` export that Docusaurus already generates.

## Background

Today an inline TOC appears only when the README contains the GitLab `[[_TOC_]]`
marker. `renderMarkdown` → `rehypeGitlabToc` ([src/gitlab/toc.ts](../../../src/gitlab/toc.ts))
replaces that marker with a `<nav class="gitlab-md-toc">` built from the README's
`h2`–`h5` headings, and assigns heading ids. Crucially, `rehypeGitlabToc` is a
**no-op unless the `[[_TOC_]]` placeholder is present**, so heading ids are only
assigned in that case.

The README is rendered to an HTML **string**, injected as a `data` prop, and
rendered via `dangerouslySetInnerHTML` ([src/components/GitlabReadme.tsx](../../../src/components/GitlabReadme.tsx)).
Docusaurus' native right-sidebar TOC is built by its own remark plugin scanning
the **page's** mdast heading nodes — it never sees headings inside our opaque HTML
string.

Relevant Docusaurus 3.10 behavior (verified in
`@docusaurus/mdx-loader/lib/remark/toc`):

- The toc plugin **respects an explicit `export const toc`** and does not override
  it; otherwise it generates `export const toc` from the page's heading nodes
  (after its `headings` plugin assigns slug ids).
- Our `remarkGitlab` is wired as a normal `remarkPlugins` entry, which runs
  **after** Docusaurus' toc plugin. So when we run, `export const toc` already
  exists (page headings only), and the page's heading nodes already carry ids at
  `node.data.hProperties.id`.

## Public API

A new optional attribute on `<GitlabReadme>`:

```mdx
<GitlabReadme project="x/y" toc="sidebar" />
```

| value         | behavior |
|---------------|----------|
| *(omitted)*   | **auto** — today's behavior: inline `<nav>` rendered **iff** the README contains `[[_TOC_]]`; heading ids assigned only then. |
| `"inline"`    | always render the inline `<nav>` built from headings, even without the marker (at the marker's position if present, else above the first heading). |
| `"sidebar"`   | no inline nav; README headings are merged into Docusaurus' native right-hand TOC in document order. |
| `"hidden"`    | no inline nav anywhere; `[[_TOC_]]` marker stripped if present. |

Invalid values throw, honoring the plugin's `strict` mode (build error in
production, `Fallback` in dev). Values must be static literals — already enforced
by [src/remark/attributes.ts](../../../src/remark/attributes.ts).

## Heading ids — the cross-cutting requirement

`sidebar` and `inline`-without-marker both need heading ids even when no
`[[_TOC_]]` marker is present. So:

- The TOC **mode** is threaded into rendering.
- **Id assignment is decoupled from nav rendering**: ids are assigned whenever a
  TOC is needed (`inline`, `sidebar`, and `auto`-with-marker).
- The same github-slugger ids are the single source of truth for both the rendered
  HTML anchors and the sidebar entries, so sidebar links always match the rendered
  headings.

## Data flow

```
fetchReadme(attrs)                      // reads attrs.toc → mode
  └─ renderMarkdown(md, { tocMode, collect })
        └─ rehypeGitlabToc({ mode, collect })  // assigns ids; emits/strips nav; pushes entries into collect
  → ReadmeData { ref, html, toc?: TocEntry[] }  // toc[] returned for sidebar mode
```

Changes:

- `rehypeGitlabToc` gains an options arg `{ mode, collect? }`. `collect` is a
  mutable array the caller passes in to receive `{ level, id, text }[]` (rehype
  plugins can't "return" a value).
- `renderMarkdown` gains a `tocMode` option and forwards it; default `"auto"`
  preserves current callers (release notes, file markdown, project description).
- `ReadmeData` ([src/gitlab/types.ts](../../../src/gitlab/types.ts)) gains optional
  `toc?: TocEntry[]`.
- The `fetchReadme` memo cache key gains the mode:
  `readme:${project}:${ref}:${mode}` (output now varies by mode).

### `rehypeGitlabToc` mode matrix

| mode      | assign ids | inline `<nav>` | marker handling                         | populate `collect` |
|-----------|------------|----------------|-----------------------------------------|--------------------|
| `auto`    | iff marker | iff marker     | replace marker with nav (today)         | no                 |
| `inline`  | yes        | always         | at marker if present, else above first heading | no          |
| `sidebar` | yes        | no             | strip marker if present                 | yes                |
| `hidden`  | yes\*      | no             | strip marker if present                 | no                 |

\* `hidden` still assigns ids so deep links / in-page anchors keep working; cheap
and avoids surprises.

## Sidebar merge (in [src/remark/index.ts](../../../src/remark/index.ts))

For each `<GitlabReadme toc="sidebar">`:

1. During the existing job loop, stash `{ node, entries }` from the returned
   `ReadmeData.toc`.
2. After `Promise.all`, run one pass over the tree:
   - Find the `mdxjsEsm` node declaring `export const toc` that Docusaurus
     generated. If absent (page with zero headings of its own), create one
     mirroring Docusaurus' export shape.
   - Determine the component's document position by the **id of the page heading
     immediately preceding it** (from a document-order walk; page heading ids come
     from `node.data.hProperties.id`).
   - **Splice** the README entries into the existing `toc` array (not a rebuild —
     we preserve Docusaurus' computed entries and never recompute page-heading
     HTML values):
     - Locate the preceding entry by id via DFS of the nested toc tree.
     - Insert the README block right after it: nest README entries **under** that
       entry when the README's min heading level is deeper than the preceding
       entry's level; otherwise insert as following siblings in the same list.
     - Component before all headings → prepend at root.
     - Multiple sidebar components on one page are processed in document order;
       each keys off its own preceding-heading id.
   - New `ObjectExpression` nodes are produced with `valueToEstree` (already a
     dependency, used in [src/remark/inject.ts](../../../src/remark/inject.ts)).

The React component renders the README HTML as before; Docusaurus' theme renders
the sidebar from the augmented export. **No HTML change, no component change, no
user config change.**

## Error handling

- Invalid `toc` value → `fetchReadme` throws → existing `strict`/`Fallback` path.
- Missing `export const toc` node → create one matching Docusaurus' shape so README
  entries still reach the sidebar.

## Testing (TDD)

- `src/gitlab/toc.test.ts`: each mode — ids assigned vs not, nav present/absent/
  stripped, `collect` populated correctly, nesting by level.
- `src/gitlab/markdown.test.ts`: `tocMode` forwarding; **XSS regression stays
  green**.
- `src/gitlab/fetchers.test.ts`: `fetchReadme` returns `toc[]` for sidebar mode;
  mode included in cache key (different modes don't collide in cache).
- `src/remark/index.test.ts`: fake mdast with an existing `export const toc` +
  page headings + `<GitlabReadme toc="sidebar">`; assert the spliced export incl.
  document-order position, nesting, and the no-existing-export case.
- Component test (`src/components/GitlabReadme.test.tsx`): behavior unchanged.
- e2e (`test/e2e/build.test.ts`, slow/explicit): a docs page with `toc="sidebar"`
  builds and the right sidebar contains the README headings.

## Known limitations (documented, out of scope)

- **Id collisions**: README slugs are generated in a separate pipeline from the
  page's headings, so a README `## Installation` and a page `## Installation`
  could collide. Accepted for now; a future `tocPrefix`/namespacing option is out
  of scope.
- **TOC slices**: a page using both `<GitlabReadme>` *and* an imported MDX partial
  that exports `toc` is an unsupported edge case; we splice into the array but
  don't reconcile partial slice spreads.

## Documentation

- README: document the `toc` attribute and the three placements.
- `examples/site/docs/components/readme.mdx`: add a `toc=` example.
- `examples/gitlab` docs: demonstrate `toc="sidebar"` on a live page.
