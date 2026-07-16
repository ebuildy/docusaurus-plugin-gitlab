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
- **Sign every commit.** All commits must be GPG-signed. The repo has
  `commit.gpgsign=true`, so this happens automatically; if signing is ever
  stripped, pass `git commit -S` and verify with `git log --format="%G?"`
  (expect `G`).
- **Docusaurus 3 only** (MDX v3, unified ESM, native `fetch`). **Node 22 or 24**
  (engines: `^22.13.0 || >=24.0.0` — pnpm 11 requires ≥22.13; Node 20 is no
  longer supported).
- Prefer the latest versions of libraries.
- ESM-first. Intra-package imports use explicit `.js` extensions
  (e.g. `import { Fallback } from "./Fallback.js"`) — required by the
  `moduleResolution: "Bundler"` / ESM setup. Match this in new files.
- Keep components **pure**: they receive a `data` or `error` prop and render —
  no fetching, no hooks, no side effects.
- When using a library or external softwre, always check the last version and
  if the project has not been abandonned

## Commands

- `pnpm run build` — compile with `tsc -p tsconfig.build.json` (ESM `.js` + `.d.ts`)
  into `dist/`. The base `tsconfig.json` sets `noEmit: true` so a stray `tsc` can't
  pollute `src/`; the build config flips `noEmit` off with `outDir: ./dist`.
  The package is **ESM-only** (`module: ESNext`): every remark/rehype/unified
  dependency is pure ESM, so a CJS build would `require()` them — which breaks
  under Node's `require(ESM)` interop (`unified().use()` receives `{ default: fn }`
  → "empty preset", failing the Docusaurus build). Do not add a CJS build or a
  `require` export condition; `test/packaging.test.ts` guards this.
- `pnpm test` — run all tests (Vitest). Use `pnpm exec vitest run <file>` for one file.
- `pnpm run typecheck` — `tsc --noEmit`.

There is no dev server. After code edits, run
`pnpm exec vitest run` and `pnpm run typecheck`. The e2e test
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
- **In `src/components/*` (browser-bundled), never spread a `Map`/`Set` iterator**
  — use `Array.from(map.values())`, not `[...map.values()]` (same for `.keys()` /
  `.entries()`). Docusaurus bundles these files with Babel, whose loose /
  `iterableIsArray` spread assumption mis-compiles `[...nonArrayIterable]` (a Map
  iterator has no `.length`/indices), yielding a wrong result and runtime errors
  like `Cannot read properties of undefined (reading 'keys')`. `tsc`-only code
  (plugin/remark/`src/gitlab/*`) runs in Node and isn't affected, but prefer
  `Array.from` there too for consistency.
- **Code highlighting** uses `prism-react-renderer` (a normal, SSR-safe npm
  dependency), NOT `@theme/CodeBlock`. Importing Docusaurus theme aliases
  (`@theme/*`) from this pre-bundled package breaks the Docusaurus SSR build with
  `require.resolveWeak is not a function` — avoid them. (The `tsc` build does not
  bundle, so `@theme/*` / `@docusaurus/*` imports stay external automatically.)
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
- Use the /commit command to create a signed commit

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Gitlab API

You are familiar with Gitlab API:

OpenAPI: <https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/api/openapi/openapi_v3.yaml>
