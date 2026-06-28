# Design: Docusaurus GitLab MDX Extensions

**Date:** 2026-06-27
**Status:** Approved (design phase)
**Package (working name):** `@ebuildy/docusaurus-plugin-gitlab`

## Summary

A TypeScript package that lets Docusaurus 3 documentation authors embed GitLab
resources — project info, README, releases, and issue lists — directly in `.mdx`
pages using JSX components. All GitLab data is fetched **at build time** by a
remark plugin and baked into the static HTML. The browser never holds a token or
calls the GitLab API.

## Decisions (locked)

| Topic | Decision |
|---|---|
| Data fetching | Build-time (SSG) only |
| GitLab target | gitlab.com **and** self-hosted (configurable host) |
| Auth | Personal/Project Access Token from env, build-time only, optional for public reads |
| v1 resources | Project info, README, Releases, Issues, plus any file/code snippet (`GitlabFile`) |
| Authoring syntax | JSX components |
| Data delivery | Remark plugin fetches and injects a `data` prop (Approach A) |
| GitLab API client | `@gitbeaker/rest` SDK (binary image/badge downloads use a small token-authenticated `fetch`) |
| Code highlighting | `prism-react-renderer` (NOT `@theme/CodeBlock`, which breaks the SSR build from a pre-bundled package) |
| Error handling | `strict` option; default `true` in prod/CI, `false` in dev |
| Styling | Infima CSS variables, swizzlable theme components |
| Docusaurus | v3 only (MDX v3, unified ESM, Node 18+ `fetch`) |

> **Update (2026-06-28):** the GitLab REST client was migrated from a hand-rolled
> `fetch` wrapper to the `@gitbeaker/rest` SDK, and a fifth component
> (`GitlabFile`) was added to embed any repository file (markdown → HTML, other →
> highlighted code with optional line ranges). The example site must NOT set
> `"type": "module"` in its `package.json` — that makes Docusaurus's CommonJS SSR
> bundle load as ESM and fail with `require.resolveWeak is not a function`.

## Architecture

One npm package with two roles:

1. **Remark plugin** (`@ebuildy/docusaurus-plugin-gitlab/remark`) — runs during MDX
   compilation, configured once in `docusaurus.config.js`.
2. **Presentational components** (`@ebuildy/docusaurus-plugin-gitlab/components`) — pure
   React, registered once into the site's MDX component map.

### Build-time data flow

```
docusaurus build
  └─ MDX compile (docs/blog/pages)
       └─ remark-gitlab walks the mdast AST
            ├─ finds <GitlabReleases project="x/y" .../>
            ├─ GitLabClient.fetch(...) ──▶ cache ──▶ GitLab REST v4
            └─ injects data={<serialized>} prop into the node
  └─ React render: <GitlabReleases data={...} /> → static HTML
```

### Package layout

```
src/
  remark/
    index.ts            # the unified/remark plugin (async transformer)
    registry.ts         # component-name → fetcher mapping
    attributes.ts       # parse JSX attributes (string + literal expressions)
    inject.ts           # serialize data → mdxJsx data attribute (estree)
  gitlab/
    client.ts           # REST v4 client (native fetch, PRIVATE-TOKEN)
    cache.ts            # filesystem cache w/ TTL
    fetchers.ts         # projectInfo / readme / releases / issues
    markdown.ts         # README markdown → sanitized HTML + link rewriting
    assets.ts           # download + localize README images/badges to static dir
    types.ts            # API + normalized domain types
  components/
    GitlabProjectInfo.tsx
    GitlabReadme.tsx
    GitlabReleases.tsx
    GitlabIssues.tsx
    index.ts            # barrel export for MDXComponents registration
    styles.module.css   # Infima-variable-based styles
  options.ts            # option schema + validation (Joi)
examples/
  site/                 # minimal Docusaurus 3 site for manual + e2e testing
```

### Tooling

- **TypeScript**, ESM-first to match Docusaurus 3 / MDX v3.
- **tsup** build → ESM + CJS + `.d.ts`.
- **Vitest** for unit tests; **React Testing Library** for component tests.

## Authoring API

### One-time setup in the consuming site

```js
// docusaurus.config.js — within the preset's docs/blog config
remarkPlugins: [
  [require('@ebuildy/docusaurus-plugin-gitlab/remark'), {
    host: 'https://gitlab.com',
    token: process.env.GITLAB_TOKEN, // optional for public-only reads
    // cache: { ttl: 3600 } | false
    // strict: true | false       (default: prod/CI true, dev false)
    // assetDir: 'static/gitlab-assets'   (where README images/badges download)
    // assetBaseUrl: '/gitlab-assets'     (served path for those assets)
  }],
]
```

```js
// src/theme/MDXComponents.js
import MDXComponents from '@theme-original/MDXComponents';
import * as Gitlab from '@ebuildy/docusaurus-plugin-gitlab/components';
export default { ...MDXComponents, ...Gitlab };
```

After setup, authors write JSX in any `.mdx` page with no per-page imports.

### Components and props

| Component | Key props | Renders |
|---|---|---|
| `GitlabProjectInfo` | `project` (required), `showStats?` | Card: name, description, topics, stars/forks, last activity, link |
| `GitlabReadme` | `project`, `ref?` | README, markdown→HTML at build; images/badges downloaded & localized, links resolved to GitLab |
| `GitlabReleases` | `project`, `limit?`, `includePrereleases?` | Releases: name, tag, date, notes, asset links |
| `GitlabIssues` | `project`, `labels?`, `state?`, `milestone?`, `limit?` | Issues: title, state badge, labels, author, link |

### `project` parameter

Accepts **either** a numeric ID (`project={12345}`) **or** the full namespace
path string (`project="group/subgroup/repo"`). The client detects the form:
numeric → used as-is; string → URL-encoded (`/` → `%2F`) per the GitLab REST
convention.

### Component contract

Each component receives exactly one of two props from the remark step:

- `data` — the normalized payload → render UI.
- `error` — `{ message, project }` (warn mode only) → render an
  Infima `admonition`-style fallback.

Components are pure: no fetching, no data hooks. This makes them trivially
testable via render-from-props.

## Remark transform

- An **async** unified transformer.
- Collects matching nodes first via `unist-util-visit` over `mdxJsxFlowElement`
  and `mdxJsxTextElement`, then `await Promise.all(...)` the fetches, then
  mutates — because `visit` is synchronous.
- A node matches when its element name is registered in `registry.ts`.
- **Attribute parsing** (`attributes.ts`):
  - String literals read directly (`project="group/repo"`).
  - Expression attributes parsed from their estree literal
    (`project={12345}`, `limit={5}`, `includePrereleases={true}`).
  - Non-literal expressions (e.g. `limit={someVar}`) are rejected with a clear
    build error — values must be statically resolvable at build time.
- **Injection** (`inject.ts`): the fetched, normalized payload is serialized into
  a new `data` prop as an `mdxJsxAttributeValueExpression` (object literal via
  estree, so it survives MDX compilation as real JS); `error` is injected
  instead in warn mode.

## GitLab client

- REST API **v4**, native `fetch`, `PRIVATE-TOKEN` header when a token is
  present (omitted for public reads).
- Per-resource fetchers:
  - Project info — `GET /projects/:id`
  - README — resolve default branch (or `ref`), then
    `GET /projects/:id/repository/files/README.md/raw?ref=<ref>`
  - Releases — `GET /projects/:id/releases`
  - Issues — `GET /projects/:id/issues?labels=&state=&milestone=`
- **Pagination** via `Link` headers / `per_page`, capped by `limit`.
- Normalizes raw API JSON into lean domain types (we do not ship full API
  responses into the HTML).

### README rendering (`markdown.ts`)

Build-time markdown → HTML pass via unified
(`remark-parse → remark-gfm → rehype-sanitize → rehype-stringify`). Rendered as
themed HTML inside a scoped container — **not** re-fed through MDX, to avoid
executing arbitrary JSX that lives in a repository's README.

- **Links** (`<a href>`): relative paths rewritten to
  `<host>/<project>/-/blob/<ref>/<path>`; absolute links left as-is.
- **Images** (`<img src>`): all images are localized via the asset pipeline
  below (no hot-linking).

### Image & badge localization (`assets.ts`)

Every image referenced by the README is downloaded at build time and rewritten
to a local static path, so embeds are self-contained and offline-safe:

- **Relative images** (e.g. `./docs/diagram.png`) → resolved to
  `<host>/<project>/-/raw/<ref>/<path>`, then downloaded.
- **Absolute external images** (e.g. CDN-hosted screenshots) → downloaded as-is.
- **Badges** (e.g. `<project>/-/badges/<ref>/pipeline.svg`, shields.io) →
  downloaded as-is. This **statifies** them: the SVG's current value (pipeline
  status, coverage, version, …) is frozen into the docs at build time. Badge
  links (the surrounding `<a>`) are preserved.

Mechanics:

- Assets are written to a managed directory under the site's static dir,
  default `static/gitlab-assets/`, served at `/gitlab-assets/...`. Filenames are
  `<contentHash>.<ext>` for dedup and cache-busting. The directory and the
  static base path are configurable via options (`assetDir`, `assetBaseUrl`).
- The downloader is content-hash deduplicated and uses the same filesystem
  cache (TTL) as API calls, so HMR and repeat builds do not re-download.
- Authenticated downloads (private repo raw images, private badges) send the
  `PRIVATE-TOKEN` header; the token never reaches the browser because the bytes
  are baked into the static asset.
- Download failures honor the `strict` option: `strict: true` aborts the build
  with file/URL context; `strict: false` warns and keeps the original remote URL
  as a fallback.

## Caching

- Filesystem cache under
  `node_modules/.cache/@ebuildy/docusaurus-plugin-gitlab/`, keyed by a hash of
  (endpoint + params + ref).
- Default **TTL 1h**. Bypass with `GITLAB_CACHE=false` env or `cache: false`
  option.
- Purpose: prevent `docusaurus start` hot-reloads from hammering the API and
  hitting rate limits.

## Error handling

- `strict` option. Default: `true` when `process.env.NODE_ENV === 'production'`
  (production build / CI), `false` in dev (`docusaurus start`).
- `strict: true` → throw an error annotated with source file path and node
  line/column (from the vfile + `node.position`), aborting the build.
- `strict: false` → log a warning and inject an `error` prop so the component
  renders a visible fallback.

## Styling

- Infima CSS variables so components inherit the site theme (light/dark)
  automatically.
- Shipped as theme/exported components so users can swizzle/override.
- Styles in `styles.module.css` (CSS modules), no external CSS framework.

## Testing

Testing is first-class and part of the definition of done.

### Unit tests (Vitest)

- **Remark transform:** fixture MDX in → AST with injected `data` out; matching,
  attribute parsing (string + literal expressions), rejection of non-literal
  expressions, error-prop injection in warn mode.
- **GitLab client + fetchers:** mocked `fetch`; success, pagination, 404 /
  missing resource, network failure, token vs no-token.
- **Asset localization:** relative / absolute / badge images downloaded and
  rewritten to local paths; content-hash dedup; authenticated download header;
  download-failure behavior under strict vs warn.
- **Cache:** hit / miss / TTL expiry / bypass.
- **Option validation:** valid + invalid option shapes.
- **Components (RTL):** render-from-`data` for each component and the `error`
  fallback path.

### E2E tests

- `examples/site` runs `docusaurus build` against a **mocked GitLab API**
  (msw or a local fixture server); assert the generated static HTML contains the
  expected embeds for each component, and that README images/badges were written
  to the asset dir with `src` rewritten to local paths.
- A real-API **smoke test** gated behind an env token, **skipped in CI** by
  default.

## Out of scope (v1)

- Runtime/client-side refresh of data.
- Merge requests, pipelines, members, milestones-as-components, group-level
  aggregations (architecture stays extensible via the registry for later).
- Markdown-directive authoring syntax.

## Extensibility

New resources are added by: (1) a fetcher in `gitlab/fetchers.ts`, (2) a
registry entry mapping a component name to that fetcher, (3) a presentational
component + export. No changes to the transform engine itself.
```