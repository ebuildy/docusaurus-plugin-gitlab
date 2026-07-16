# Live example (gitlab.com)

A Docusaurus 3 site that embeds **real public content** from gitlab.com, fetched
at build time. Unlike [`../site`](../site) (which uses a mocked API for the e2e
test), this site talks to the actual GitLab API.

Showcased projects:

- [`gitlab-org/api/client-go`](https://gitlab.com/gitlab-org/api/client-go) —
  project info, README (with localized images/badges), releases, issues, and
  source-file snippets.
- [`gitlab-org/gitlab`](https://gitlab.com/gitlab-org/gitlab) — project info,
  releases, issues, and small file embeds (its README is intentionally skipped —
  it's huge and references hundreds of assets).

## Layout

```text
examples/gitlab/
├─ docusaurus.config.ts   # remark plugin, host=gitlab.com, strict:false
├─ sidebars.ts
├─ src/theme/MDXComponents.ts
└─ docs/
   ├─ intro.mdx           # homepage (slug: /) — project cards for both repos
   ├─ client-go.mdx       # full showcase of all five components
   └─ gitlab.mdx          # project info + releases + issues + file snippets
```

## Configuration notes

- `host` defaults to `https://gitlab.com` (override with `GITLAB_HOST`).
- `strict: false` — live data, so a transient API/rate-limit failure renders a
  fallback instead of breaking the build.
- No token is required for these public projects. Set `GITLAB_TOKEN` to raise the
  rate limit (unauthenticated is 500 requests/min) or to read private projects.
- Same hard requirements as any consumer site: no `"type": "module"` in
  `package.json`, `slug: /` on the index doc, `onBrokenLinks: "ignore"`.

## Running

```bash
# from the repo root: install the workspace and build the plugin the site
# consumes via its workspace link
pnpm install                # first time only
pnpm run build

# from examples/gitlab
pnpm run build              # production build → ./build  (hits gitlab.com)
pnpm run serve              # preview the production build
# or
pnpm start                  # dev server with hot reload (http://localhost:3000)

# optional: authenticate to raise the rate limit
GITLAB_TOKEN=glpat-xxxxxxxx pnpm run build
```

Because this build performs live network requests, it is slower than the mocked
e2e and is **not** part of the automated test suite.
