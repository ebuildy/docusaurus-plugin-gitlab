# GitLab `::include` directive expansion — design

- **Status:** approved (brainstorm), pending implementation plan
- **Date:** 2026-07-04
- **Package:** `@ebuildy/docusaurus-plugin-gitlab`

## Problem

GitLab Flavored Markdown supports an **include directive** that splices one
document's content into another
([docs](https://docs.gitlab.com/user/markdown/#includes)):

```text
::include{file=chapter1.md}
::include{file=https://example.org/installation.md}
```

Our plugin fetches GitLab READMEs and files at build time and splices them into
Docusaurus pages, but it does not yet understand `::include`. When a fetched
README (or markdown file) contains `::include{file=…}`, the directive is passed
through verbatim and renders as literal text instead of pulling in the
referenced content.

We must expand `::include` so the referenced file's content is included **raw in
the main markdown** — i.e. spliced as markdown source that then compiles as part
of the host document.

## Scope

`::include` is authored **inside GitLab-hosted markdown** (a README or a `.md`
file), not in the author's `.mdx` page. It is therefore a feature of the
**webpack-loader include subsystem** (`src/include/`), which already fetches
GitLab sources and rewrites the host `.mdx` source at load time:

```text
gitlabIncludeLoader (src/include/loader.ts)
  └─ transformIncludes (src/include/transform.ts)   // finds {@includeGitlab…}
       ├─ fetchReadmeSource / fetchFileSource        // raw GitLab source
       └─ renderSource (src/include/render-source.ts) // → MDX-safe markdown source
```

`renderSource` produces **markdown source text** (not HTML) that is spliced back
into the host `.mdx` and compiled by Docusaurus. That is exactly the "raw in the
main markdown" semantics we want, so `::include` expansion belongs here.

**In scope:** expansion inside both `{@includeGitlabReadme}` and markdown
`{@includeGitlabFile}` includes (any content for which `isMarkdownSource` is
true).

**Also in scope (added later):** the JSX-component path (`<GitlabReadme>` /
markdown `<GitlabFile>`). The `fetchReadme` / `fetchFile` fetchers expand
`::include` on the raw markdown **before** `renderMarkdown`, so the components
behave consistently with the loader placeholders. This required threading the
include settings (`strict`, `includeAllowedHosts`, `debug`) into the
`GitLabContext.options` populated by `buildContext`.

## Grammar

A leaf directive occupying its own line, matching GitLab:

```text
::include{file=<path-or-url>}
```

- Only the `file` attribute is honored. Its value may be bare
  (`file=chapter1.md`) or quoted (`file="path with space.md"` / single quotes).
- No `ref`, line-range, or `project` extensions (YAGNI). A relative include
  inherits the **`ref` of the enclosing include** and targets the **same
  project**, matching GitLab's same-repo semantics.
- The directive is recognized as a standalone block (its own line), **including
  inside a fenced/indented/inline code region**. Per GitLab
  ([Use includes in code blocks](https://docs.gitlab.com/user/markdown/#use-includes-in-code-blocks)),
  a directive inside a code region has its target inserted **verbatim** (not
  processed as markdown, not wrapped in another fence, not recursed into) so the
  file's content appears in the surrounding code block. Outside code regions,
  targets are expanded as described below.

## Design

### New module: `src/include/expand.ts`

Exports `expandFileIncludes(md, o, guard)`:

- `md: string` — markdown source (host include body, already frontmatter-stripped).
- `o` — resolution context: `{ ctx: GitLabContext; project: string; ref: string;
  allowedHosts: string[]; strict: boolean }`.
- `guard` — recursion guard: `{ depth: number; stack: Set<string> }`.
- Returns the markdown with every `::include{…}` directive replaced by the raw
  (recursively expanded) content of its target.

### Hook point: `renderSource`

In `src/include/render-source.ts`, the `isMarkdownSource` branch calls
`expandFileIncludes` **after `stripFrontmatter`, before `processMarkdownSource`**:

```ts
if (isMarkdownSource(o.kind, o.path)) {
  let body = stripFrontmatter(raw);
  body = await expandFileIncludes(body, {
    ctx: o.ctx, project: o.project, ref: o.ref,
    allowedHosts: o.allowedHosts, strict: o.strict,
  }, { depth: 0, stack: new Set([keyFor(o)]) });
  return processMarkdownSource(body, { localizeImage, absolutizeLink });
}
```

Consequences of this ordering:

- Included content is spliced as **raw text**, then the merged document flows
  through the *same* prose transforms (image localization, link absolutization,
  MDX escaping) as the host — one coherent document.
- Relative images/links inside included files are resolved the same way as the
  host README's (project-root-relative, consistent with the existing
  `absolutizeFactory` behavior and its current limitation).

### Resolution per directive

For each `::include{file=X}` the target is fetched:

- **Remote** — `X` matches `^https?://`: parse the URL, check its host against
  `allowedHosts`. If not listed → error. If listed → fetch the body via native
  `fetch` (text).
- **Relative** — otherwise: `fetchFileSource(ctx, { project: o.project, path: X,
  ref: o.ref })`, reusing the existing GitLab client and on-disk cache.

How the fetched content is spliced depends on where the directive sits:

- **Inside a code region** (fenced/indented/inline) → inserted **verbatim**: no
  frontmatter stripping, no fence wrapping, no recursion. The content lands in
  the author's existing code block.
- **In prose, markdown target** (`.md`/`.mdx`/`.markdown`) → `stripFrontmatter`-ed
  and **recursively expanded** before being spliced.
- **In prose, non-markdown target** → wrapped in a fenced, syntax-highlighted
  code block (`` ```<lang> `` via `languageFromPath`) so raw YAML/JSON/etc.
  renders cleanly instead of as garbled markdown.

### Code-region detection

Each directive's position is classified via `codeRanges` from
`render-source.ts`: a match whose offset falls inside a code range is treated as
"inside a code block" (verbatim insertion above), otherwise as prose. Directives
are **not** skipped — GitLab expands them in both contexts.

### Recursion guard

`guard = { depth, stack }`:

- `depth` increments per nesting level; exceeding `MAX_INCLUDE_DEPTH` (constant,
  `8`) throws `"::include exceeded max depth (8)"`.
- `stack` holds the resolution keys currently being expanded, keyed by
  `` `${project}@${ref}/-/${path}` `` for GitLab files and by the absolute URL
  for remote includes. Re-entering a key already on the stack throws
  `"::include cycle detected: <key>"`. Keys are removed as each branch unwinds
  (a diamond — the same file included twice in different branches — is allowed;
  only true cycles are rejected).

### Security

New plugin option `includeAllowedHosts: string[]`, **default `[]`**:

- Empty ⇒ remote (`http(s)`) includes are rejected; only GitLab-project-file
  includes work.
- Hosts are matched exactly (case-insensitive) against the URL's host.
- Threaded through `src/options.ts` (`PluginOptions`, `ResolvedOptions`, Joi
  schema, `resolveOptions` default `[]`) → `loader.ts` → `transformIncludes`
  (`TransformOptions`) → `renderSource` (`RenderSourceOptions.allowedHosts`).

Local GitLab-file includes are always permitted; they are already gated by the
configured `host`/`token`.

### Error handling

Mirrors `transformIncludes`:

- `strict: true` (production default) → throw; the error bubbles to
  `transformIncludes`'s catch, aborting the build with a
  `@ebuildy/docusaurus-plugin-gitlab: …` message.
- `strict: false` → replace the offending directive with an inline marker
  `> ⚠️ ::include{file=…} failed — <message>` and continue.

Failure cases: unlisted remote host, fetch/network error, missing file, cycle,
depth exceeded, malformed directive.

## Testing (TDD)

`src/include/expand.test.ts` (fake/mocked `fetchFileSource` and `fetch`):

- Relative-file include expands to the fetched file's raw content.
- Remote include from an allowlisted host expands; from a non-allowlisted host
  errors (strict) / emits the warning marker (non-strict).
- Nested include (an included file containing `::include`) expands recursively.
- Cycle (A includes B includes A) throws `"cycle detected"`.
- Depth beyond `MAX_INCLUDE_DEPTH` throws.
- `::include{…}` inside a fenced code block inserts the target **verbatim** (no
  extra fence, no processing).
- A non-markdown target in prose is wrapped in a highlighted code block.
- Quoted and bare `file=` values both parse.
- Strict vs non-strict error behavior.

Wiring tests in `src/include/render-source.test.ts`:

- `renderSource` expands `::include` for markdown sources and passes
  `allowedHosts` through.
- Non-markdown (code) includes are unaffected.

Update `src/include/transform.test.ts` / `src/options.test.ts` as needed for the
new option threading. Run `npx vitest run` and `npm run typecheck`; run the e2e
build (`test/e2e/build.test.ts`) since the loader pipeline is touched.

## Documentation

- README: document `::include{file=…}` support and the `includeAllowedHosts`
  option.
- Add an example under `examples/site/` exercising a relative include (and, if
  practical, a nested include).

## Non-goals / future work

- No `ref`, line-range, or `project` attributes on `::include`.
- File-relative (as opposed to project-root-relative) image/link resolution is
  not addressed here; it inherits the existing behavior and limitation.
