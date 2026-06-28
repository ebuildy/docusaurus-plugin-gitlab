# CLAUDE.md

Guidance for AI agents working in this repository.

## What this project is

`@ebuildy/docusaurus-plugin-gitlab` — a set of MDX extensions that embed GitLab resources
(project info, README, releases, issues, and arbitrary files/code snippets) into
**Docusaurus 3** documentation pages as JSX components.

All GitLab data is fetched **at build time** by a remark plugin and baked into the
static HTML. The browser never holds a token or calls the GitLab API.

## Hard rules

- **Git/GitHub:** This is a live GitHub repo (`ebuildy/docusaurus-plugin-gitlab`).
  Normal git usage is fine. CI runs on PRs and pushes to `main` via GitHub
  Actions (`.github/workflows/`); releases are automated with release-please and
  published to npm via OIDC trusted publishing — see CONTRIBUTING.md.
- **Docusaurus 3 only** (MDX v3, unified ESM, Node 18+ `fetch`).
- Prefer the latest versions of libraries.
- ESM-first. Intra-package imports use explicit `.js` extensions
  (e.g. `import { Fallback } from "./Fallback.js"`) — required by the
  `moduleResolution: "Bundler"` / ESM setup. Match this in new files.
- Keep components **pure**: they receive a `data` or `error` prop and render —
  no fetching, no hooks, no side effects.

## Commands

- `npm run build` — build the package with tsup (ESM + CJS + d.ts) into `dist/`.
- `npm run test` — run all tests (Vitest). Use `npx vitest run <file>` for one file.
- `npm run typecheck` — `tsc --noEmit`.

There is no lint step and no dev server. After code edits, run
`npx vitest run` and `npm run typecheck`. The e2e test
(`test/e2e/build.test.ts`) builds a real Docusaurus site and is slow (~1 min);
run it explicitly when touching the pipeline.

## Architecture (build-time data flow)

```text
docusaurus build
  └─ MDX compile
       └─ remark plugin (src/remark/index.ts) walks the mdast tree
            ├─ finds registered <Gitlab*> JSX elements (src/remark/registry.ts)
            ├─ parses their attributes (src/remark/attributes.ts)
            ├─ runs the matching fetcher (src/gitlab/fetchers.ts)
            │    └─ GitLabClient (gitbeaker) + FileCache + AssetManager
            └─ injects the result as a `data` prop (src/remark/inject.ts)
  └─ React render: pure components (src/components/) render the data → static HTML
```

## Module map

| File | Responsibility |
|---|---|
| `src/options.ts` | Plugin option validation (Joi) + defaults (`resolveOptions`) |
| `src/gitlab/client.ts` | `GitLabClient` — thin wrapper over `@gitbeaker/rest`; plus `requestBinary` (native fetch) for image/badge bytes |
| `src/gitlab/cache.ts` | `FileCache` — on-disk JSON cache with TTL |
| `src/gitlab/assets.ts` | `AssetManager` — downloads + localizes README images/badges to the static dir |
| `src/gitlab/markdown.ts` | `renderMarkdown` — markdown → **sanitized** HTML (unified), with image/link rewrite hooks |
| `src/gitlab/fetchers.ts` | One fetcher per component; normalizes GitLab data → domain types; memoized via cache |
| `src/gitlab/types.ts` | Domain types (`ProjectInfoData`, `ReleaseData`, `IssueData`, `ReadmeData`, `FileData`) |
| `src/remark/*` | The remark plugin: registry, attribute parsing, data injection, transformer |
| `src/components/*` | Pure presentational React components + shared `Fallback`, `styles.module.css` |
| `examples/site/` | Minimal Docusaurus 3 site used by the e2e test |

## Conventions & gotchas

- **gitbeaker responses are snake_case** (`tag_name`, `web_url`, `star_count`,
  `default_branch`, `assets.links`, …) — same as the REST API. Normalize to our
  camelCase domain types in the fetchers.
- **Security:** anything rendered via `dangerouslySetInnerHTML` (README/file
  markdown, release notes) MUST come from `renderMarkdown`, which runs
  `rehype-raw` **before** `rehype-sanitize`. Never feed raw API text to
  `dangerouslySetInnerHTML`. There is an XSS regression test in
  `src/gitlab/markdown.test.ts` — keep it green.
- **CSS modules** are typed via `src/css.d.ts`.
- **Code highlighting** uses `prism-react-renderer` (a normal, SSR-safe npm
  dependency), NOT `@theme/CodeBlock`. Importing Docusaurus theme aliases
  (`@theme/*`) from this pre-bundled package breaks the Docusaurus SSR build with
  `require.resolveWeak is not a function` — avoid them. (`tsup.config.ts` still
  externalizes `@theme/*` / `@docusaurus/*` defensively.)
- **Component attribute values must be static literals** (`project="x/y"`,
  `limit={5}`, `lines="10-25"`). Dynamic expressions are rejected at build time
  so data can be fetched deterministically.
- **Error handling:** the remark plugin's `strict` option (default: true in
  production, false in dev) decides whether a failed fetch throws (aborting the
  build) or injects an `error` prop that renders the `Fallback`.

## Adding a new GitLab component

1. Add a domain type to `src/gitlab/types.ts`.
2. Add a fetcher in `src/gitlab/fetchers.ts` (normalize + `memo(...)` for caching).
3. Register it in `src/remark/registry.ts` (`ComponentName: fetcher`).
4. Add a pure component in `src/components/` following the
   `error → Fallback; no data → null; else render` shape.
5. Export it from `src/components/index.ts` (and the type from `src/index.ts`).
6. Add unit tests (fetcher + component) and, if it renders untrusted markdown,
   route it through `renderMarkdown`.
7. Document it (README + a page under `examples/site/docs/components/`).

## Workflow expectations

- Use TDD: write the failing test, then the implementation.
- Tests verify behavior (React Testing Library queries by role/text; client and
  fetchers use mocked gitbeaker / fake clients; cache and assets use real temp
  dirs). Do not add MSW.
- The design spec and implementation plan live in `docs/superpowers/`.
