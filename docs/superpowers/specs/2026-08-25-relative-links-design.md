# Design: absolute-ize relative links in fetched GitLab markdown

**Date:** 2026-08-25
**Status:** Approved (brainstorming)

## Problem

Relative links inside fetched GitLab markdown (`[CONTRIBUTING](CONTRIBUTING.md)`,
`[guide](./docs/guide.md)`) are emitted verbatim into the static HTML. Docusaurus
then reads them as **internal** links relative to the page they landed on,
resolves them against a route that does not exist, and **fails the build**:

```text
[ERROR] Docusaurus found broken links!
Broken link on source page path = /projects/my-proj:
   -> linkTo = /projects/CONTRIBUTING.md
```

Today the only way to build a site using `<GitlabReadme>` is
`onBrokenLinks: "ignore"` — which is what both example sites in this repo do
([examples/site/docusaurus.config.ts:16](../../../examples/site/docusaurus.config.ts),
[examples/gitlab/docusaurus.config.ts:27](../../../examples/gitlab/docusaurus.config.ts)),
suppressing every genuine broken link in the site along with these.

## Summary

Rewrite relative links at build time into absolute GitLab URLs pointing at the
source repository:

```text
CONTRIBUTING.md  →  https://gitlab.com/group/proj/-/blob/main/CONTRIBUTING.md
```

Docusaurus only checks *internal* links, so an absolute URL with a host is
skipped by the checker entirely — the build passes and the link goes somewhere
real. Fixing the build error, not merely the reader experience, is the point of
this change; it is what sets the scope below.

A new plugin option `publicUrl` makes the URL prefix configurable, defaulting to
`host`, for deployments where the build-time API host differs from the
user-facing GitLab URL.

**Scope: all four `renderMarkdown` call sites**, since a relative link breaks the
build identically wherever it is rendered:

| call site | `ref` | `basePath` |
|---|---|---|
| `fetchReadme` (`fetchers.ts:262`) | resolved `ref` | `"README.md"` |
| `fetchFile`, markdown branch (`:590`) | resolved `ref` | the file's own `path` |
| `fetchProjectInfo` description (`:129`) | `p.default_branch ?? "HEAD"` | — (repo root) |
| `fetchReleases` notes (`:161`) | `r.tag_name` | — (repo root) |

## Background

The rendering pipeline already has both halves of the mechanism:

- `renderMarkdown` (`src/gitlab/markdown.ts`) exposes a `transformLinkHref?:
  (href: string) => Promise<string>` hook, applied to every `<a href>` in the
  hast tree. **No fetcher passes it today** — it is covered only by a unit test.
- `AssetManager.absolute()` (`src/gitlab/assets.ts`) already performs the
  equivalent transform for images, building
  `${host}/${project}/-/raw/${ref}/${path}` before downloading the bytes.

So the missing piece is a resolver, plus wiring it into the four call sites.

## Architecture

A new **pure module** `src/gitlab/links.ts`. It performs no I/O, touches no
cache, and needs no mocking to test.

```ts
export interface RepoLinkContext {
  /** Public GitLab base URL, no trailing slash. */
  publicUrl: string;
  /** Project path with namespace, e.g. "group/project". */
  project: string;
  /** Branch, tag, or SHA the markdown was read at. */
  ref: string;
  /** Repo-relative path of the file being rendered, e.g. "docs/guide.md".
   *  Relative links resolve against its directory. */
  basePath?: string;
}

export function resolveRepoLink(href: string, ctx: RepoLinkContext): string;
```

Rejected alternatives:

- **A method on `AssetManager`** — that class owns network + cache + disk for
  binary assets. A pure string transform does not belong there and would inherit
  its async signature and constructor dependencies for no reason.
- **A rehype plugin in the render chain** — duplicates the existing
  `transformLinkHref` hook, and would either bake the resolver into
  `defaultMarkdownRenderChain` (where users overriding the chain would silently
  lose it) or require chain surgery per call site.

## Resolution rules

Applied in order; the first match wins.

| # | Input | Result |
|---|---|---|
| 1 | `""` or whitespace-only | unchanged |
| 2 | starts with `#` (`#usage`) | unchanged — in-page anchor |
| 3 | has a URI scheme, `/^[a-z][a-z0-9+.-]*:/i` (`https:`, `mailto:`, `tel:`, `data:`) | unchanged |
| 4 | protocol-relative, starts with `//` | unchanged |
| 5 | anything else | rewritten (below) |

Rewriting, for case 5:

1. Split the href at the first `?` or `#`, whichever comes first, into a path
   part and a suffix. The suffix (`?query`, `#hash`, or `?query#hash`) is
   preserved verbatim and re-appended unchanged at the end.
2. Resolve the path part:
   - a leading `/` means **repository root** — strip it,
   - otherwise resolve against `dirname(basePath)`, honouring `./` and `../`;
     when `basePath` is absent the base is the repository root,
   - `..` segments that would escape the repository root are **clamped** at the
     root rather than emitting `..` into the URL.
3. Emit `${publicUrl}/${project}/-/blob/${ref}/${path}${query}${hash}`.

Worked examples, with `publicUrl: "https://gitlab.com"`, `project:
"group/proj"`, `ref: "main"`:

| `basePath` | href | output |
|---|---|---|
| `README.md` | `CONTRIBUTING.md` | `https://gitlab.com/group/proj/-/blob/main/CONTRIBUTING.md` |
| `README.md` | `./docs/x.md#install` | `https://gitlab.com/group/proj/-/blob/main/docs/x.md#install` |
| `README.md` | `/docs/x.md` | `https://gitlab.com/group/proj/-/blob/main/docs/x.md` |
| `docs/a.md` | `b.md` | `https://gitlab.com/group/proj/-/blob/main/docs/b.md` |
| `docs/a.md` | `../b.md` | `https://gitlab.com/group/proj/-/blob/main/b.md` |
| `docs/a.md` | `../../../etc` | `https://gitlab.com/group/proj/-/blob/main/etc` |

### Decisions worth recording

**Always `/-/blob/`, never `/-/tree/`.** Telling a file from a directory would
need a repository-tree API call per distinct link. GitLab already redirects a
`/-/blob/` URL that points at a directory to the tree view, so probing buys
nothing but latency and cache surface.

**A leading `/` means the repository root.** GitLab itself resolves `/x` against
the *instance* root. We deliberately diverge: `AssetManager.absolute()` already
strips `^\.?\/` and treats image paths as repo-relative, and the intent of the
feature is to point at repository files. One mental model for images and links
beats matching GitLab's edge case. It also matters for the build error —
`/docs/x.md` is just as internal to Docusaurus as `docs/x.md`, so leaving
`/`-rooted links alone would leave the build broken.

**In-page anchors stay untouched.** A README's `#installation` points at a
heading rendered into the very same page, so it resolves correctly. Docusaurus
checks these under `onBrokenAnchors` (default `warn`), and the heading ids are
present in the emitted HTML, so they pass.

**No re-encoding.** The href is passed through as authored and only prefixed, so
an already-encoded `%20` is not double-encoded.

## Wiring

`src/gitlab/fetchers.ts`:

- `fetchReadme` gains
  `transformLinkHref: async (href) => resolveRepoLink(href, { …, basePath: "README.md" })`,
  alongside the existing `transformImageSrc`.
- `fetchFile`'s markdown branch passes the file's own `path` as `basePath`, so a
  relative link inside `docs/guide.md` resolves against `docs/`.
- `fetchProjectInfo`'s `descriptionHtml` uses `ref: p.default_branch ?? "HEAD"`
  (the project object is already in hand; `default_branch` is null for an empty
  repository, and GitLab accepts `HEAD` in a blob URL) and no `basePath` — a
  description is not a file, so its links resolve from the repository root.
- `fetchReleases`' `descriptionHtml` uses `ref: r.tag_name`, so a release note
  links to the tree as it was at that tag. No `basePath`, same reasoning.

A small helper in `fetchers.ts` keeps the four call sites from repeating the
context object:

```ts
const linkResolver = (ctx: GitLabContext, project: string, ref: string, basePath?: string) =>
  async (href: string) => resolveRepoLink(href, { publicUrl: ctx.options.publicUrl, project, ref, basePath });
```

`ctx.options` (the `GitLabContext` options bag built in `src/gitlab/context.ts`)
gains `publicUrl: string`, so fetchers read it without threading `ResolvedOptions`
through.

## The `publicUrl` option

```ts
// PluginOptions
/** Public GitLab base URL used to build links to repository files. Defaults to
 *  `host`. Set it when the build-time API host differs from the user-facing URL
 *  (e.g. an internal hostname behind a reverse proxy). */
publicUrl?: string;

// ResolvedOptions
publicUrl: string;
```

- Joi: `publicUrl: Joi.string().uri().optional()`.
- Resolution: `(opts.publicUrl ?? opts.host).replace(/\/+$/, "")` — same
  trailing-slash normalization `host` already gets.
- **Links only.** Asset downloads keep using `host`: they happen at build time
  against the API, where the internal hostname is the correct one.

Example:

```js
{
  host: "http://gitlab.internal:8080",   // build-time API calls
  publicUrl: "https://gitlab.example.com", // links baked into the HTML
}
```

## Cache interaction

Rendered HTML is memoized on disk under keys like
`readme:{project}:{ref}:{toc}`. Changing `publicUrl` therefore leaves previously
cached HTML — and its links — stale until the TTL expires.

**Decision: do not add `publicUrl` to the memo key.** `assetBaseUrl` and
`markdownRenderChain` already have exactly this property, the default TTL is one
hour, and `node_modules/.cache` is disposable. The behaviour is documented in the
README option description instead.

## Testing

TDD, in this order:

1. **`src/gitlab/links.test.ts`** (new) — `resolveRepoLink` as a table:
   pass-through cases (empty, `#anchor`, `https://`, `mailto:`, `//host`),
   rewriting cases (bare, `./`, `/`-rooted, `../`, nested `basePath`),
   query + hash preservation, `..` clamping at the root, and a `publicUrl`
   carrying a trailing slash.
2. **`src/options.test.ts`** — `publicUrl` defaults to `host`, strips trailing
   slashes, and is rejected when not a URI.
3. **`src/gitlab/fetchers.test.ts`** — one case per call site: a README whose
   relative link comes out absolute; a nested `<GitlabFile>` markdown file whose
   relative link resolves against its own directory; a project description
   resolved at the default branch; and a release note resolved at its tag, not
   at the default branch.

`src/gitlab/markdown.test.ts` already covers the `transformLinkHref` hook; no
change needed there. No component changes: the components render the HTML they
are given.

### Build-level guard

`examples/gitlab/docusaurus.config.ts` flips `onBrokenLinks` from `"ignore"` to
`"throw"`. That site renders live gitlab.com READMEs, so its build becomes a real
regression test: reintroduce a relative link and the build fails the way a user's
build does today.

`examples/site` (the stub e2e fixture) stays on `"ignore"` — it is hand-written
and may hold unrelated placeholder links that would fail CI for reasons unrelated
to this feature.

`onBrokenMarkdownLinks` is left alone in both: it governs Docusaurus's own
`.md`-to-`.md` resolution in authored docs, not the HTML this plugin injects.

## Documentation

- README: a `publicUrl` row in the plugin options table, plus a short subsection
  explaining relative-link rewriting, the `/-/blob/` target, and — since this is
  the reason the feature exists — that sites no longer need
  `onBrokenLinks: "ignore"` to render fetched GitLab markdown.
- `examples/site/docs/components/` — note the behaviour on the `GitlabReadme`
  page.

## Out of scope

- Mapping links to `.md` files onto the Docusaurus site's own routes instead of
  GitLab (a much larger feature: it needs a repo-path → doc-route mapping).
- Fixing relative **image** resolution for nested `<GitlabFile>` markdown —
  `AssetManager.localize` resolves image `src` against the repo root regardless
  of the file's directory. Same root cause, separate change.
