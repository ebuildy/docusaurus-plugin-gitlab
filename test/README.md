# Tests

This package has two layers of tests:

| Layer | Location | Runner / env | What it covers |
|---|---|---|---|
| **Unit** | `src/**/*.test.ts(x)` (next to the code) | Vitest (`node`, or `jsdom` for `src/components/**`) | Options, cache, GitLab client, markdown rendering, asset localization, fetchers, remark transform, and each React component (rendered from props). External calls are mocked. |
| **End-to-end** | `test/e2e/` | Vitest (`node`) | Builds a real Docusaurus site (`examples/site`) against a mocked GitLab API and asserts the embeds are baked into the static HTML — **twice**: once on Docusaurus 3 defaults, once with the Docusaurus 4 `future.v4` flags (Rspack/SWC/LightningCSS). |

`test/setup.ts` registers `@testing-library/jest-dom` matchers for the component tests.

---

## How the end-to-end test works

The e2e test proves the whole build-time pipeline without touching the real
GitLab API. It runs entirely on `localhost`, and it runs the same site through
the pipeline twice — see "Two build variants" below. Per variant:

1. A tiny **stub HTTP server** ([`test/e2e/fixtures.ts`](./e2e/fixtures.ts))
   stands in for GitLab's REST API on a random port.
2. The test ([`test/e2e/build.test.ts`](./e2e/build.test.ts)) runs
   `docusaurus build` on `examples/site` with `GITLAB_HOST` pointed at the stub
   and `DOCUSAURUS_FUTURE_V4` selecting the variant (see below), writing to a
   variant-specific `--out-dir`.
3. During the build, the remark plugin (via `@gitbeaker/rest`) fetches project
   info, README, releases and issues from the stub, and downloads the README
   image into the site's static assets.
4. After the build, the test reads that variant's out-dir (`build-classic/` or
   `build-v4/`) and asserts the data was baked into the HTML and the image was
   localized.

### Two build variants

`describe.each` runs the whole suite once per variant, **sequentially** (not
`describe.concurrent`): both builds share `.docusaurus/`,
`static/gitlab-assets/` and `docs/generate/*`, and only the `beforeAll`/`afterAll`
cleanup keeps them from clobbering each other.

| Variant | `DOCUSAURUS_FUTURE_V4` | Out-dir | Toolchain |
|---|---|---|---|
| `classic` | `"0"` | `build-classic/` | webpack + Babel + cssnano — what every current user runs. |
| `v4` | `"1"` | `build-v4/` | Rspack + SWC + LightningCSS + `@swc/html` — the closest approximation of Docusaurus 4 available from a published release. |

### Flow

```text
┌─────────────────────────── vitest process ────────────────────────────┐
│                                                                       │
│  beforeAll: startGitlabStub()  ──►  http://127.0.0.1:<random-port>    │
│                                          ▲                            │
│  runBuild()  ── spawn ──►  child: docusaurus build --out-dir <dir>    │
│   (async; sequential)          │                                      │
│                                ├─ remark-gitlab (gitbeaker) ──────────┤  GET /api/v4/projects/...
│                                │                              fetch   │  (project, releases, issues, README raw)
│                                ├─ AssetManager ───────────────────────┤  GET /group/repo/-/raw/main/logo.png
│                                │                              fetch   │  → downloaded to static/gitlab-assets/
│  └─ writes ► examples/site/<out-dir>/*.html                           │
│                                                                       │
│  it(...) ► read <out-dir>/index.html + static/gitlab-assets/ ► assert │
│  afterAll: stub.stop() + clean <out-dir>/ + gitlab-assets/            │
└───────────────────────────────────────────────────────────────────────┘
```

`<dir>` / `<out-dir>` above is `build-classic` for the `classic` variant and
`build-v4` for the `v4` variant — each run of the diagram happens once per row
in the variant table.

> **Why `spawn` and not `execFileSync`?** The stub server runs in the *same*
> process as the test. A synchronous child process would block the event loop,
> so the stub could never answer the build's requests (gitbeaker would retry
> until it times out). `runBuild()` uses async `spawn` and `await`s it, keeping
> the event loop free to serve the stub.

### Environment passed to the build

| Variable | Value in the test | Purpose |
|---|---|---|
| `GITLAB_HOST` | the stub's `http://127.0.0.1:<port>` | Overrides the plugin's `host` so all API + raw-asset traffic hits the stub. |
| `GITLAB_TOKEN` | `""` (empty) | Unauthenticated; the stub does not check auth. |
| `DOCUSAURUS_FUTURE_V4` | `"1"` for the `v4` variant, `"0"` for `classic` | Selects which pipeline `examples/site/docusaurus.config.ts` builds: `"1"` spreads in `future: { v4: true }` (Rspack/SWC/LightningCSS); `"0"` builds Docusaurus 3 defaults. The `classic` variant pins `"0"` explicitly rather than omitting the variable — an ambient `DOCUSAURUS_FUTURE_V4=1` exported in the shell or CI would otherwise make both variants build v4 and the matrix would report green with zero Docusaurus 3 coverage. |

### Mocked GitLab endpoints (the "schema")

The stub answers these routes (everything else → `404`):

| Method & path | Response (content-type) | Shape |
|---|---|---|
| `GET /api/v4/projects/group%2Frepo` | JSON | `{ id, path_with_namespace, name, description, web_url, star_count, forks_count, topics[], last_activity_at, avatar_url, default_branch }` |
| `GET /api/v4/projects/group%2Frepo/releases` | JSON | `[{ name, tag_name, released_at, description, upcoming_release, assets: { links[] } }]` |
| `GET /api/v4/projects/group%2Frepo/issues` | JSON | `[{ iid, title, state, web_url, labels[], author: { name, web_url }, created_at }]` |
| `GET …/repository/files/README.md/raw` | text/plain | Markdown source, including `![logo](./logo.png)` to exercise image localization |
| `GET /group/repo/-/raw/main/logo.png` | image/png | A 1×1 PNG (raw project path, **not** under `/api/v4`) — resolved from the relative README image |

Field names are **snake_case** because that is what the real GitLab REST API
(and gitbeaker) returns; the plugin normalizes them into camelCase domain types.

### What the assertions verify

Each of the following is checked against **both** `build-classic/` and
`build-v4/`:

1. **Embeds are baked into the HTML** — `<out-dir>/index.html` contains the
   project name (`Repo`), a release (`v1.0`), an issue (`A bug`), and README
   text (`Readme body`).
2. **Images are localized** — `examples/site/static/gitlab-assets/` exists and
   contains at least one hashed `.png` file.
3. **HTML references the local asset** — `<out-dir>/index.html` references
   `/gitlab-assets/` rather than the remote GitLab URL.
4. **The `{@includeGitlab...}` pre-loader substitutes its placeholder** —
   `<out-dir>/includes/index.html` contains the included README text in its
   rendered article body, not the raw `{@includeGitlabReadme: ...}` placeholder
   (that raw string does legitimately survive in `<meta name="description">`,
   since Docusaurus derives that from the raw MDX source before the loader
   runs — the assertion is scoped to the rendered `<article>` instead).

### Example-site requirements (already configured)

For the build to succeed during SSG, `examples/site` must:

- **not** set `"type": "module"` in `package.json` — otherwise Docusaurus's
  CommonJS server bundle is loaded as ESM and fails with
  `require.resolveWeak is not a function`;
- mark the index doc with `slug: /` so it renders to `<out-dir>/index.html`;
- set `onBrokenLinks: "ignore"` (the e2e cares about embeds, not link integrity).

---

## Running the tests

From the repository root:

```bash
# Prerequisites (first time only)
pnpm install                     # whole workspace: root deps + example sites (Docusaurus 3)
pnpm run build                   # build dist/ — the example site consumes it via its workspace link

# All tests (unit + e2e)
pnpm test

# Unit tests only (fast)
pnpm exec vitest run --exclude '**/test/e2e/**'

# End-to-end only (both variants)
npx vitest run test/e2e/build.test.ts
```

Notes:

- The e2e test runs `docusaurus build` twice (once per variant), so it takes
  longer than a single build — budget ~1–2 minutes; each variant's build step
  has a 300s timeout in `beforeAll`.
- A real-GitLab smoke test is intentionally **not** run in CI. To try the
  components against real data, set `GITLAB_HOST` / `GITLAB_TOKEN` and build
  `examples/site` manually (add `DOCUSAURUS_FUTURE_V4=1` to try the v4 path).
- The e2e cleans up after itself (each variant's out-dir and
  `static/gitlab-assets/` are removed in `afterAll`).
- `examples/site/package.json` also installs `@docusaurus/faster` as a
  devDependency (it, not Docusaurus 3 alone, is what supplies the Rspack/SWC/
  LightningCSS toolchain the `v4` variant's `future.v4` flags switch on).
