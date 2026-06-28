# GitHub Actions: CI + Release — Design

**Date:** 2026-06-28
**Package:** `@ebuildy/docusaurus-plugin-gitlab`
**Repo:** `github.com/ebuildy/docusaurus-plugin-gitlab`

## Goal

Add GitHub Actions to lint, type-check, test, build, and release the package.
Releases are automated with **release-please** and published to npm via **OIDC
trusted publishing** (no long-lived token).

## Decisions (locked)

| Question | Decision |
|---|---|
| Release model | release-please (conventional-commit driven release PR) |
| npm auth | Trusted publishing (OIDC), provenance enabled |
| Node test matrix | 18, 20, 22 |
| e2e in CI | Yes — runs on every PR/push, all matrix versions |
| Workflow structure | Plan A: two workflows (`ci.yml` + `release.yml`) |
| Security checks | CodeQL, Dependabot + dependency review, OpenSSF Scorecard (no standalone `npm audit` gate) |
| CI hardening | Least-privilege `permissions`, SHA-pinned third-party actions, npm provenance |

## Repo facts that shape the design

- ESM-first dual build via tsup → `dist/` (ESM + CJS + d.ts). `npm run build`.
- Scripts: `build` (tsup), `test` (`vitest run`), `typecheck` (`tsc --noEmit`),
  `lint` (`eslint . && markdownlint-cli2`).
- Vitest `include` is `src/**/*.test.{ts,tsx}` and `test/**/*.test.{ts,tsx}` —
  so `npm test` **already includes** the e2e suite (`test/e2e/build.test.ts`).
- The e2e test spawns `npm run build` inside `examples/site` (a real Docusaurus
  3 build) against a local GitLab stub. It therefore requires:
  1. the package built (`dist/`) — the site links it via `file:../..`;
  2. the example site's own deps installed (`examples/site` has its own
     `package-lock.json`).
- Scoped package (`@ebuildy/...`) → publishing needs `--access public`.
- Node 20 local; CLAUDE.md states Node 18+ support.
- Existing local quality gates: husky `pre-commit` → `lint-staged`
  (eslint --fix, markdownlint --fix). CI re-checks lint without `--fix`.

## Architecture

Files under `.github/`:

- `.github/workflows/ci.yml` — lint, typecheck, test/build matrix, dependency review.
- `.github/workflows/release.yml` — release-please + OIDC publish.
- `.github/workflows/codeql.yml` — SAST.
- `.github/workflows/scorecard.yml` — OpenSSF Scorecard.
- `.github/dependabot.yml` — npm + github-actions update schedule.

The two core CI/CD workflows (`ci.yml`, `release.yml`) are detailed first; the
security workflows are specified in the **Security** section below.

### `ci.yml`

```text
on: pull_request, push (branches: [main])
concurrency: group per ref, cancel-in-progress: true

jobs:
  lint:            # runtime-independent checks, Node 20 only
    - actions/checkout
    - actions/setup-node (node 20, cache: npm)
    - npm ci
    - npm run lint        # eslint . && markdownlint-cli2
    - npm run typecheck   # tsc --noEmit

  test:            # matrix: node 18, 20, 22
    strategy.matrix.node: [18, 20, 22]
    - actions/checkout
    - actions/setup-node (matrix node, cache: npm,
        cache-dependency-path: [package-lock.json, examples/site/package-lock.json])
    - npm ci                         # root deps
    - npm run build                  # produce dist/ for the file: link
    - npm ci --prefix examples/site  # example site deps (Docusaurus)
    - npm test                       # vitest: unit + e2e (real docusaurus build)
```

Notes:
- Build is verified implicitly: `test` cannot pass without a successful
  `npm run build`, so no standalone build job is needed.
- e2e runs on all three Node versions (heaviest part, ~3–4 min total); accepted
  for maximum confidence per decision.

### `release.yml`

```text
on: push (branches: [main])
concurrency: group "release", cancel-in-progress: false

jobs:
  release-please:
    permissions: { contents: write, pull-requests: write }
    - googleapis/release-please-action (release-type: node)
    outputs: release_created, tag_name

  publish:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    permissions: { id-token: write, contents: read }
    - actions/checkout
    - actions/setup-node (node 20, registry-url: https://registry.npmjs.org)
    - npm install -g npm@latest      # ensure OIDC-capable npm (>= 11.5)
    - npm ci
    - npm run build
    - npm publish --provenance --access public
```

Notes:
- `release-please` maintains a "release PR" (version bump + CHANGELOG) from
  conventional commits. Merging that PR sets `release_created=true`, tags, and
  triggers `publish`.
- `publish` uses OIDC trusted publishing: no `NODE_AUTH_TOKEN` / `NPM_TOKEN`.
  `id-token: write` is required for both OIDC auth and provenance.

### release-please config files

- `release-please-config.json` — single package at repo root, `release-type:
  node`, `package-name: @ebuildy/docusaurus-plugin-gitlab`.
- `.release-please-manifest.json` — seeded to current version `"." : "0.1.0"`.

## Security

### Baseline hardening (applied to all workflows)

- **Least privilege**: each workflow declares a top-level `permissions: {}` (deny
  all by default) and grants the minimum tokens per job (e.g. `contents: read`,
  and `security-events: write` only where SARIF is uploaded).
- **SHA-pinned actions**: all third-party actions (release-please, checkout,
  setup-node, codeql, scorecard, dependency-review) are pinned to a full commit
  SHA, not a floating tag, to defend against tag-retargeting / action compromise.
  Dependabot (below) keeps these SHAs updated.
- **npm provenance**: publish runs `--provenance` under OIDC (see release.yml).

### `codeql.yml` — static analysis (SAST)

```text
on: pull_request, push (branches: [main]), schedule (weekly cron)
permissions: { security-events: write, contents: read, actions: read }

jobs:
  analyze:
    - github/codeql-action/init   (languages: javascript-typescript)
    - github/codeql-action/analyze
```

Relevant because the package renders sanitized HTML via
`dangerouslySetInnerHTML`; CodeQL's JS/TS queries flag injection-style patterns.
Findings surface in the Security tab and as PR checks.

### `dependabot.yml` + dependency review

- `.github/dependabot.yml` — two ecosystems on a weekly schedule:
  - `npm` (root `package.json`; `examples/site` is a test fixture — include if
    desired, otherwise root only),
  - `github-actions` (keeps the SHA-pinned action versions patched).
- **Dependency review** step in `ci.yml` on `pull_request`
  (`actions/dependency-review-action`): blocks PRs that introduce dependencies
  with known high/critical CVEs or disallowed licenses.

### `scorecard.yml` — OpenSSF Scorecard

```text
on: push (branches: [main]), schedule (weekly cron)
permissions: { security-events: write, id-token: write, contents: read }

jobs:
  analysis:
    - ossf/scorecard-action (results_format: sarif, publish_results: true)
    - github/codeql-action/upload-sarif (results.sarif)
```

Posture report (branch protection, pinned deps, token perms, etc.), published to
the Security tab; a README badge is optional.

### Repo settings to enable (manual, outside code)

- Secret scanning + push protection (GitHub native, free for public repos).
- Dependabot alerts/security updates enabled in repo settings.

## One-time manual setup (outside this codebase)

1. **npmjs.com trusted publisher**: register the repo
   `ebuildy/docusaurus-plugin-gitlab` + workflow `release.yml` as a trusted
   publisher for the package.
2. **First publish bootstrap** ⚠️: the package is not yet published (v0.1.0).
   Trusted publishing for a brand-new package name may require a one-time manual
   `npm publish --access public` to create the package, after which OIDC
   publishing works for subsequent releases. Document this in the README /
   CONTRIBUTING release notes.

## Stale-instruction cleanup (in scope)

`CLAUDE.md` currently states "DO NOT use git / this repo is intentionally not a
git repository," and the auto-memory `never-use-git` mirrors it. The repo is now
a live GitHub repository with CI/CD. As part of this work:

- Update `CLAUDE.md` to remove the no-git hard rule and reflect the GitHub
  Actions workflow (CI on PRs, release-please + OIDC publish).
- Update/remove the `never-use-git` memory accordingly.

(During the brainstorming session itself, no git commands were run, honoring the
rule until it is formally retired.)

## Optional / nice-to-have (decide at planning time)

- `actionlint` to validate workflow YAML locally or as a small CI step.
- Dependabot for GitHub Actions version bumps.

## Testing strategy for this change

Workflows are validated by execution:
1. Open a PR with the new workflows → confirm `lint` + `test` (3 Node versions,
   including e2e) pass.
2. Land a conventional commit on `main` → confirm release-please opens a release
   PR.
3. Merge the release PR → confirm `publish` runs and the package appears on npm
   with provenance.

Static check before pushing: `actionlint` (optional) and a manual review of the
two workflow files.

## Out of scope

- Multi-package / monorepo release flows (single package).
- Publishing the example site (it is a test fixture only).
- Coverage upload / external reporting services.
