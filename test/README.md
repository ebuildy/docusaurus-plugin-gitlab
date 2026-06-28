# Tests

This package has two layers of tests:

| Layer | Location | Runner / env | What it covers |
|---|---|---|---|
| **Unit** | `src/**/*.test.ts(x)` (next to the code) | Vitest (`node`, or `jsdom` for `src/components/**`) | Options, cache, GitLab client, markdown rendering, asset localization, fetchers, remark transform, and each React component (rendered from props). External calls are mocked. |
| **End-to-end** | `test/e2e/` | Vitest (`node`) | Builds a real Docusaurus 3 site (`examples/site`) against a mocked GitLab API and asserts the embeds are baked into the static HTML. |

`test/setup.ts` registers `@testing-library/jest-dom` matchers for the component tests.

---

## How the end-to-end test works

The e2e test proves the whole build-time pipeline without touching the real
GitLab API. It runs entirely on `localhost`:

1. A tiny **stub HTTP server** ([`test/e2e/fixtures.ts`](./e2e/fixtures.ts))
   stands in for GitLab's REST API on a random port.
2. The test ([`test/e2e/build.test.ts`](./e2e/build.test.ts)) runs
   `docusaurus build` on `examples/site` with `GITLAB_HOST` pointed at the stub.
3. During the build, the remark plugin (via `@gitbeaker/rest`) fetches project
   info, README, releases and issues from the stub, and downloads the README
   image into the site's static assets.
4. After the build, the test reads `examples/site/build/` and asserts the data
   was baked into the HTML and the image was localized.

### Flow

```text
┌─────────────────────────── vitest process ───────────────────────────┐
│                                                                       │
│  beforeAll: startGitlabStub()  ──►  http://127.0.0.1:<random-port>    │
│                                          ▲                            │
│  runBuild()  ── spawn ──►  child: `npm run build` (examples/site)     │
│   (async!)                     │                                      │
│                                ├─ remark-gitlab (gitbeaker) ──────────┤  GET /api/v4/projects/...
│                                │                              fetch   │  (project, releases, issues, README raw)
│                                ├─ AssetManager ───────────────────────┤  GET /group/repo/-/raw/main/logo.png
│                                │                              fetch   │  → downloaded to static/gitlab-assets/
│                                └─ writes ► examples/site/build/*.html  │
│                                                                       │
│  it(...) ► read build/index.html + static/gitlab-assets/  ► assert    │
│  afterAll: stub.stop() + clean build/ + gitlab-assets/                │
└───────────────────────────────────────────────────────────────────────┘
```

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

1. **Embeds are baked into the HTML** — `build/index.html` contains the project
   name (`Repo`), a release (`v1.0`), an issue (`A bug`), and README text
   (`Readme body`).
2. **Images are localized** — `examples/site/static/gitlab-assets/` exists and
   contains at least one hashed `.png` file.
3. **HTML references the local asset** — `build/index.html` references
   `/gitlab-assets/` rather than the remote GitLab URL.

### Example-site requirements (already configured)

For the build to succeed during SSG, `examples/site` must:

- **not** set `"type": "module"` in `package.json` — otherwise Docusaurus's
  CommonJS server bundle is loaded as ESM and fails with
  `require.resolveWeak is not a function`;
- mark the index doc with `slug: /` so it renders to `build/index.html`;
- set `onBrokenLinks: "ignore"` (the e2e cares about embeds, not link integrity).

---

## Running the tests

From the repository root:

```bash
# Prerequisites (first time only)
npm install                      # root deps
(cd examples/site && npm install)  # example site deps (Docusaurus 3)
npm run build                    # build dist/ — the example site consumes it via file:../..

# All tests (unit + e2e)
npm test

# Unit tests only (fast)
npx vitest run --exclude '**/test/e2e/**'

# End-to-end only
npx vitest run test/e2e/build.test.ts
```

Notes:

- The e2e test runs `docusaurus build`, so it takes ~30–60s; the build step has
  a 180s timeout in `beforeAll`.
- A real-GitLab smoke test is intentionally **not** run in CI. To try the
  components against real data, set `GITLAB_HOST` / `GITLAB_TOKEN` and build
  `examples/site` manually.
- The e2e cleans up after itself (`build/` and `static/gitlab-assets/` are
  removed in `afterAll`).
