# Design: resolving relative links in fetched GitLab markdown

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

Pointing at GitLab is the right default, but not the only useful answer: a site
that mirrors a repository's whole markdown tree wants those links to stay
*inside* Docusaurus. A `relativeLinks` flag — settable per component and as a
plugin-wide default — selects between the two, with `linkBase` prefixing the
site-internal form. See [Link modes](#link-modes).

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
export type LinkMode = "gitlab" | "keep" | "site";

export interface RepoLinkContext {
  /** Where a relative link should point. Default: "gitlab". */
  mode: LinkMode;
  /** Public GitLab base URL, no trailing slash. Used by "gitlab" mode. */
  publicUrl: string;
  /** Project path with namespace, e.g. "group/project". */
  project: string;
  /** Branch, tag, or SHA the markdown was read at. */
  ref: string;
  /** Repo-relative path of the file being rendered, e.g. "docs/guide.md".
   *  Relative links resolve against its directory. */
  basePath?: string;
  /** Site path the mirrored docs tree is mounted at, no trailing slash.
   *  Used by "site" mode. Default: "" (site root). */
  linkBase?: string;
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

## Link modes

`relativeLinks` selects where a relative link points. It is a **plugin option**
(the site-wide default) and an **attribute** on every component that renders
markdown (the per-use override).

| value | behaviour | when |
|---|---|---|
| `gitlab` *(default)* | absolute GitLab blob URL | the docs site shows a repository it does not mirror |
| `site` | site-internal path, `.md`/`.mdx` stripped, prefixed with `linkBase` | the site mirrors the repo's markdown tree and you want to browse it in Docusaurus |
| `keep` | href untouched | escape hatch: you handle mapping yourself via `outProcessors` or a custom `markdownRenderChain` |

`linkBase` is the site path the mirrored tree is mounted at (`"/repo"`,
`"/docs/gitlab"`). It is likewise both a plugin option and an attribute, defaults
to `""` (site root), has trailing slashes stripped, and is **ignored outside
`site` mode**.

```mdx
<GitlabReadme project="group/proj" relativeLinks="site" linkBase="/repo" />
<GitlabFile project="group/proj" path="docs/a.md" relativeLinks="keep" />
```

```js
// plugin options — site-wide default for a mirrored tree
{ host: "https://gitlab.com", relativeLinks: "site", linkBase: "/repo" }
```

Resolution per render: `attrs.relativeLinks ?? options.relativeLinks ?? "gitlab"`,
and the same shape for `linkBase`. An unrecognized value throws at build time with
the message style `readTocMode` already uses in `fetchers.ts:246`:

```text
@ebuildy/docusaurus-plugin-gitlab: <GitlabReadme> "relativeLinks" must be one of
"gitlab", "keep", "site"; got "internal".
```

In `keep` mode the fetchers omit `transformLinkHref` entirely rather than passing
an identity function — no hast walking, no work.

### Broken links in `site` mode

`site` mode emits *internal* links, so Docusaurus checks them. A mirrored tree
with a wrong `linkBase` will fail the build under `onBrokenLinks: "throw"` — and
that is the intended behaviour: it tells you the mapping is wrong instead of
shipping dead links. Worth calling out in the README so it is not mistaken for a
regression of the very error this feature fixes.

### Note on the include path

`{@includeGitlabReadme:…}` / `{@includeGitlabFile:…}` (`src/include/transform.ts`)
splice **markdown** into the MDX source, which Docusaurus compiles and whose
`.md` links it resolves natively against its own doc tree. That path already
behaves like `site` mode and needs no flag; `relativeLinks` applies to the
component path only. The README should say so, since the two paths are otherwise
interchangeable.

## Resolution rules

Applied in order; the first match wins.

| # | Input | Result |
|---|---|---|
| 1 | `""` or whitespace-only | unchanged |
| 2 | starts with `#` (`#usage`) | unchanged — in-page anchor |
| 3 | has a URI scheme, `/^[a-z][a-z0-9+.-]*:/i` (`https:`, `mailto:`, `tel:`, `data:`) | unchanged |
| 4 | protocol-relative, starts with `//` | unchanged |
| 5 | anything else | rewritten (below) |

Rewriting, for case 5, happens in two stages: **normalize to a repo-root path**
(shared by every mode), then **apply the mode's prefix**.

Stage 1 — normalize:

1. Split the href at the first `?` or `#`, whichever comes first, into a path
   part and a suffix. The suffix (`?query`, `#hash`, or `?query#hash`) is
   preserved verbatim and re-appended unchanged at the end.
2. Resolve the path part:
   - a leading `/` means **repository root** — strip it,
   - otherwise resolve against `dirname(basePath)`, honouring `./` and `../`;
     when `basePath` is absent the base is the repository root,
   - `..` segments that would escape the repository root are **clamped** at the
     root rather than emitting `..` into the URL.

The result is always a clean repo-root-relative path, e.g. `docs/x.md`.

Stage 2 — apply the mode:

| mode | output |
|---|---|
| `gitlab` | `${publicUrl}/${project}/-/blob/${ref}/${path}${suffix}` |
| `site` | `${linkBase}/${path minus .md/.mdx}${suffix}` |
| `keep` | never reaches stage 1 — the href is returned untouched |

Worked examples, with `publicUrl: "https://gitlab.com"`, `project:
"group/proj"`, `ref: "main"`, `mode: "gitlab"`:

| `basePath` | href | output |
|---|---|---|
| `README.md` | `CONTRIBUTING.md` | `https://gitlab.com/group/proj/-/blob/main/CONTRIBUTING.md` |
| `README.md` | `./docs/x.md#install` | `https://gitlab.com/group/proj/-/blob/main/docs/x.md#install` |
| `README.md` | `/docs/x.md` | `https://gitlab.com/group/proj/-/blob/main/docs/x.md` |
| `docs/a.md` | `b.md` | `https://gitlab.com/group/proj/-/blob/main/docs/b.md` |
| `docs/a.md` | `../b.md` | `https://gitlab.com/group/proj/-/blob/main/b.md` |
| `docs/a.md` | `../../../etc` | `https://gitlab.com/group/proj/-/blob/main/etc` |

Same inputs with `mode: "site"` and `linkBase: "/repo"`:

| `basePath` | href | output |
|---|---|---|
| `README.md` | `CONTRIBUTING.md` | `/repo/CONTRIBUTING` |
| `README.md` | `./docs/x.md#install` | `/repo/docs/x#install` |
| `docs/a.md` | `../b.md` | `/repo/b` |
| `docs/a.md` | `assets/logo.png` | `/repo/docs/assets/logo.png` — extension kept, only `.md`/`.mdx` is stripped |

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

**`site` mode emits site-absolute paths, not relative ones.** Stage 1 already
normalizes every link to a repo-root path, so prefixing with `linkBase` is one
line and the result does not depend on the current page's URL. Relative output
would have been at the mercy of Docusaurus's trailing-slash behaviour, where
`./x` resolves differently from `/page/` than from `/page`. This differs from
what I sketched when we picked the modes (`./docs/x.md` → `./docs/x`); the
`linkBase` prefix is what made site-absolute the simpler and more predictable
form. Say so if you'd rather keep links relative.

**`site` mode strips only `.md` and `.mdx`.** No `README` → directory-index
mapping, no `index` special-casing: those depend on the docs plugin's routing
config, and guessing wrong produces a broken link that is harder to diagnose than
an honest `/repo/docs/README`.

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
/** Returns the transformLinkHref hook, or undefined in "keep" mode. */
function linkResolver(
  ctx: GitLabContext,
  attrs: Attrs,
  project: string,
  ref: string,
  basePath?: string,
): ((href: string) => Promise<string>) | undefined {
  const mode = readLinkMode(attrs.relativeLinks, ctx.options.relativeLinks);
  if (mode === "keep") return undefined;
  const linkBase = readLinkBase(attrs.linkBase, ctx.options.linkBase);
  return async (href) =>
    resolveRepoLink(href, { mode, publicUrl: ctx.options.publicUrl, project, ref, basePath, linkBase });
}
```

`readLinkMode` validates and falls back (attribute → plugin option → `"gitlab"`),
mirroring `readTocMode`; `readLinkBase` does the same plus trailing-slash
stripping.

`ctx.options` (the `GitLabContext` options bag built in `src/gitlab/context.ts`)
gains `publicUrl: string`, so fetchers read it without threading `ResolvedOptions`
through.

## New plugin options

```ts
// PluginOptions
/** Public GitLab base URL used to build links to repository files. Defaults to
 *  `host`. Set it when the build-time API host differs from the user-facing URL
 *  (e.g. an internal hostname behind a reverse proxy). */
publicUrl?: string;
/** Where relative links in fetched markdown should point. Default: "gitlab".
 *  Overridable per component with the `relativeLinks` attribute. */
relativeLinks?: "gitlab" | "keep" | "site";
/** Site path the mirrored docs tree is mounted at, used by `relativeLinks:
 *  "site"`. Default: "" (site root). Overridable per component. */
linkBase?: string;

// ResolvedOptions
publicUrl: string;
relativeLinks: "gitlab" | "keep" | "site";
linkBase: string;
```

- Joi: `publicUrl: Joi.string().uri().optional()`,
  `relativeLinks: Joi.string().valid("gitlab", "keep", "site").optional()`,
  `linkBase: Joi.string().allow("").optional()`.
- Resolution: `(opts.publicUrl ?? opts.host).replace(/\/+$/, "")` — same
  trailing-slash normalization `host` already gets; `relativeLinks ?? "gitlab"`;
  `(opts.linkBase ?? "").replace(/\/+$/, "")`.
- All three are forwarded through `buildContext` into `ctx.options`.
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

Rendered HTML is memoized on disk under keys like `readme:{project}:{ref}:{toc}`.
Making `relativeLinks` and `linkBase` per-component attributes turns cache keying
from a staleness question into a **correctness** one:

```mdx
<GitlabReadme project="group/proj" />
<GitlabReadme project="group/proj" relativeLinks="site" linkBase="/repo" />
```

Both renders memoize under the same key today, so the second would serve the
first's HTML — GitLab links where site links were asked for. The memo keys for
`fetchReadme` and `fetchFile` therefore **must** gain the two values:

```text
readme:{project}:{ref}:{toc}:{relativeLinks}:{linkBase}
file:{project}:{path}:{ref}:{lines}:{relativeLinks}:{linkBase}
```

`fetchProjectInfo` and `fetchReleases` need the same treatment for the same
reason, since both accept the attributes too.

`publicUrl` stays **out** of the keys: it is global, so it cannot vary within a
build. Changing it leaves stale HTML until the TTL expires — exactly as
`assetBaseUrl` and `markdownRenderChain` already do. The default TTL is one hour
and `node_modules/.cache` is disposable; the README option description notes it.

## Testing

TDD, in this order:

1. **`src/gitlab/links.test.ts`** (new) — `resolveRepoLink` as a table:
   - pass-through: empty, `#anchor`, `https://`, `mailto:`, `//host`, and every
     href under `mode: "keep"`;
   - `gitlab` mode: bare, `./`, `/`-rooted, `../`, nested `basePath`, query +
     hash preservation, `..` clamped at the root, `publicUrl` with a trailing
     slash;
   - `site` mode: `.md` and `.mdx` stripped, non-markdown extensions kept,
     `linkBase` applied, `linkBase: ""` yielding a root-absolute path, trailing
     slash on `linkBase` stripped, hash preserved after extension stripping.
2. **`src/options.test.ts`** — `publicUrl` defaults to `host`, strips trailing
   slashes, and is rejected when not a URI; `relativeLinks` defaults to
   `"gitlab"` and rejects an unknown value; `linkBase` defaults to `""` and
   strips trailing slashes.
3. **`src/gitlab/fetchers.test.ts`** — one case per call site: a README whose
   relative link comes out absolute; a nested `<GitlabFile>` markdown file whose
   relative link resolves against its own directory; a project description
   resolved at the default branch; and a release note resolved at its tag, not
   at the default branch. Plus, for the flag:
   - the attribute overrides the plugin option, and the plugin option applies
     when the attribute is absent;
   - an invalid `relativeLinks` value throws with the component name in the
     message;
   - **two `<GitlabReadme>` renders of the same project with different
     `relativeLinks` produce different HTML** — the regression test for the memo
     keys described in [Cache interaction](#cache-interaction).

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

- README: `publicUrl`, `relativeLinks`, and `linkBase` rows in the plugin options
  table; `relativeLinks` / `linkBase` rows in the attribute table of each
  component that renders markdown; and a subsection covering the three modes, the
  `/-/blob/` target, the fact that sites no longer need `onBrokenLinks: "ignore"`
  to render fetched GitLab markdown, that `site` mode's links *are* checked by
  Docusaurus, and that the `{@includeGitlab…}` path needs no flag.
- `examples/site/docs/components/` — note the behaviour on the `GitlabReadme`
  page, with a `relativeLinks="site"` example.

## Out of scope

- Route-aware mapping in `site` mode: reading the docs plugin's `routeBasePath`,
  slugs, or front-matter `id`s to derive the real route instead of stripping the
  extension and applying `linkBase`. If `linkBase` proves too blunt, that is the
  follow-up.
- Fixing relative **image** resolution for nested `<GitlabFile>` markdown —
  `AssetManager.localize` resolves image `src` against the repo root regardless
  of the file's directory. Same root cause, separate change.
