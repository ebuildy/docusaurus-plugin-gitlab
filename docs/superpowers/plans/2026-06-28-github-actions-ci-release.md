# GitHub Actions CI + Release + Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions to lint, type-check, test, build, and release `@ebuildy/docusaurus-plugin-gitlab` to npm (via release-please + OIDC trusted publishing), plus security checks (CodeQL, Dependabot + dependency review, OpenSSF Scorecard).

**Architecture:** Plan A — two core workflows (`ci.yml`, `release.yml`) plus three security workflows (`codeql.yml`, `scorecard.yml`, `dependabot.yml`). CI runs lint/typecheck once and the full test suite (unit + real Docusaurus e2e) on a Node 18/20/22 matrix. Releases are conventional-commit driven by release-please; publishing uses npm OIDC trusted publishing with provenance (no long-lived token). All third-party actions are pinned to commit SHAs.

**Tech Stack:** GitHub Actions, release-please (`googleapis/release-please-action@v4`), CodeQL (`github/codeql-action@v3`), OpenSSF Scorecard (`ossf/scorecard-action@v2`), Dependabot, npm 11+ (OIDC), actionlint, pinact.

**Spec:** `docs/superpowers/specs/2026-06-28-github-actions-ci-release-design.md`

---

## Prerequisites (one-time, mostly outside this repo)

These are tracked here but are not code tasks. Do them before/around the first release:

- On npmjs.com, register `ebuildy/docusaurus-plugin-gitlab` + `.github/workflows/release.yml` as a **trusted publisher** for the package.
- First publish bootstrap: package `@ebuildy/docusaurus-plugin-gitlab` is not yet on npm. The first publish may need a manual `npm publish --access public` (NO `--provenance` — provenance requires CI/OIDC) to create the package name, after which OIDC publishing works. Documented in CONTRIBUTING.md (Task 9).
- In repo Settings: enable Dependabot alerts/security updates, secret scanning + push protection.

## Tooling used for verification

- **actionlint** validates workflow YAML. Install: `brew install actionlint` (macOS), or `bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash)` which drops an `./actionlint` binary in the cwd. Run: `actionlint` (auto-discovers `.github/workflows/`).
- **pinact** pins `uses:` tags to SHAs (Task 8). Install: `go install github.com/suzuki-shunsuke/pinact/cmd/pinact@latest`, or `brew install suzuki-shunsuke/pinact/pinact`.
- JSON validity: `node -e "JSON.parse(require('node:fs').readFileSync('<file>','utf8')); console.log('ok')"`.

## File structure

| File | Responsibility |
|---|---|
| `CLAUDE.md` (modify) | Retire the stale "DO NOT use git" hard rule; document the CI/CD flow |
| `.claude/.../memory/never-use-git.md` (delete) + `MEMORY.md` (modify) | Remove the stale no-git memory |
| `.github/workflows/ci.yml` (create) | lint + typecheck job; test/build matrix job; dependency-review job |
| `.github/workflows/release.yml` (create) | release-please job + OIDC publish job |
| `.github/workflows/codeql.yml` (create) | CodeQL JS/TS SAST |
| `.github/workflows/scorecard.yml` (create) | OpenSSF Scorecard |
| `.github/dependabot.yml` (create) | npm + github-actions weekly updates |
| `release-please-config.json` (create) | release-please single-package config |
| `.release-please-manifest.json` (create) | version manifest seeded at 0.1.0 |
| `package.json` (modify) | add `publishConfig.access = public` |
| `CONTRIBUTING.md` (modify) | document the release process + bootstrap |

---

## Task 1: Retire the stale no-git rule

This authorizes git usage for the rest of execution. Do it first.

**Files:**
- Modify: `CLAUDE.md` (the "Hard rules" list)
- Delete: `/Users/tdecaux/.claude/projects/-Users-tdecaux-dev-ebuildy-mdx-gitlab-set/memory/never-use-git.md`
- Modify: `/Users/tdecaux/.claude/projects/-Users-tdecaux-dev-ebuildy-mdx-gitlab-set/memory/MEMORY.md`

- [ ] **Step 1: Edit `CLAUDE.md` to remove the no-git rule**

Replace this bullet in the "Hard rules" section:

```markdown
- **DO NOT use git.** Never run any git command (no `init`, `status`, `add`,
  `commit`, anything). This repo is intentionally not a git repository.
```

with:

```markdown
- **Git/GitHub:** This is a live GitHub repo (`ebuildy/docusaurus-plugin-gitlab`).
  Normal git usage is fine. CI runs on PRs and pushes to `main` via GitHub
  Actions (`.github/workflows/`); releases are automated with release-please and
  published to npm via OIDC trusted publishing — see CONTRIBUTING.md.
```

- [ ] **Step 2: Delete the stale memory file**

```bash
rm "/Users/tdecaux/.claude/projects/-Users-tdecaux-dev-ebuildy-mdx-gitlab-set/memory/never-use-git.md"
```

- [ ] **Step 3: Remove its index line from `MEMORY.md`**

Delete this line from `MEMORY.md`:

```markdown
- [Never use git](never-use-git.md) — no git commands in this project, ever
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: retire stale no-git rule now that repo is on GitHub"
```

(The memory files live outside the repo and are not committed.)

---

## Task 2: CI workflow (`ci.yml`)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions: {}

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    strategy:
      fail-fast: false
      matrix:
        node: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
          cache-dependency-path: |
            package-lock.json
            examples/site/package-lock.json
      - run: npm ci
      - name: Build package (needed by the example site file: link)
        run: npm run build
      - name: Install example site deps
        working-directory: examples/site
        run: npm ci
      - name: Run tests (unit + e2e docusaurus build)
        run: npm test

  dependency-review:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: high
```

- [ ] **Step 2: Validate the workflow with actionlint**

Run: `actionlint .github/workflows/ci.yml`
Expected: no output (exit 0). Any error message means fix the YAML.

- [ ] **Step 3: Confirm the referenced npm scripts succeed locally**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: all exit 0; `dist/` is (re)generated.

(`npm test` runs the slow ~1min e2e — optional to run locally here; CI will run it. To run it locally: `npm run build && (cd examples/site && npm ci) && npm test`.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck, test matrix, and dependency review"
```

---

## Task 3: release-please config files

**Files:**
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`

- [ ] **Step 1: Create `release-please-config.json`**

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "@ebuildy/docusaurus-plugin-gitlab"
    }
  }
}
```

- [ ] **Step 2: Create `.release-please-manifest.json` seeded at the current version**

```json
{
  ".": "0.1.0"
}
```

- [ ] **Step 3: Validate both files parse as JSON**

Run:
```bash
node -e "JSON.parse(require('node:fs').readFileSync('release-please-config.json','utf8')); JSON.parse(require('node:fs').readFileSync('.release-please-manifest.json','utf8')); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add release-please-config.json .release-please-manifest.json
git commit -m "build: add release-please config and manifest"
```

---

## Task 4: `publishConfig` for public scoped publishing

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `publishConfig` to `package.json`**

Insert this block immediately after the `"license": "MIT",` line:

```json
  "publishConfig": {
    "access": "public"
  },
```

(Scoped packages default to restricted; this makes both CI and any manual bootstrap publish public. Provenance is passed as a CI-only flag, not here, so a local bootstrap publish without OIDC still works.)

- [ ] **Step 2: Verify the package tarball contains only `dist/`**

Run: `npm pack --dry-run`
Expected: the file list shows `dist/...` entries and package metadata, and does NOT include `src/`, `test/`, or `examples/`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: publish scoped package with public access"
```

---

## Task 5: Release workflow (`release.yml`)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions: {}

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release-please:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
    steps:
      - id: release
        uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  publish:
    needs: release-please
    if: needs.release-please.outputs.release_created == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
          cache: npm
      - name: Use OIDC-capable npm
        run: npm install -g npm@latest
      - run: npm ci
      - run: npm run build
      - run: npm publish --provenance --access public
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/release.yml`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add release-please + OIDC npm publish workflow"
```

---

## Task 6: CodeQL workflow (`codeql.yml`)

**Files:**
- Create: `.github/workflows/codeql.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: CodeQL

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  schedule:
    - cron: "27 3 * * 1"

permissions: {}

jobs:
  analyze:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read
      actions: read
    steps:
      - uses: actions/checkout@v4
      - uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
      - uses: github/codeql-action/analyze@v3
        with:
          category: "/language:javascript-typescript"
```

- [ ] **Step 2: Validate with actionlint**

Run: `actionlint .github/workflows/codeql.yml`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/codeql.yml
git commit -m "ci: add CodeQL JS/TS static analysis"
```

---

## Task 7: Dependabot + Scorecard

**Files:**
- Create: `.github/dependabot.yml`
- Create: `.github/workflows/scorecard.yml`

- [ ] **Step 1: Create `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
```

- [ ] **Step 2: Create `.github/workflows/scorecard.yml`**

```yaml
name: Scorecard

on:
  push:
    branches: [main]
  schedule:
    - cron: "18 4 * * 1"

permissions: {}

jobs:
  analysis:
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: ossf/scorecard-action@v2
        with:
          results_file: results.sarif
          results_format: sarif
          publish_results: true
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

- [ ] **Step 3: Validate the scorecard workflow with actionlint**

Run: `actionlint .github/workflows/scorecard.yml`
Expected: no output (exit 0).

(`dependabot.yml` is not a workflow; actionlint does not cover it. GitHub validates it on push and surfaces errors in the repo's Insights → Dependency graph → Dependabot tab. Visually confirm it matches the block above.)

- [ ] **Step 4: Commit**

```bash
git add .github/dependabot.yml .github/workflows/scorecard.yml
git commit -m "ci: add Dependabot and OpenSSF Scorecard"
```

---

## Task 8: Pin all third-party actions to commit SHAs

Hardening per the spec. Tags above are working/testable; this converts them to SHAs. Dependabot's `github-actions` ecosystem (Task 7) keeps them current afterward.

**Files:**
- Modify: every file under `.github/workflows/`

- [ ] **Step 1: Install pinact**

Run (pick one):
```bash
brew install suzuki-shunsuke/pinact/pinact
# or:
go install github.com/suzuki-shunsuke/pinact/cmd/pinact@latest
```
Expected: `pinact --version` prints a version.

- [ ] **Step 2: Provide a GitHub token so pinact can resolve tags**

Run: `export GITHUB_TOKEN="$(gh auth token)"`
Expected: no error (requires `gh auth login` already done).

- [ ] **Step 3: Pin tags to SHAs**

Run: `pinact run`
Expected: `pinact` rewrites each `uses: owner/repo@vTAG` to `uses: owner/repo@<40-char-sha> # vTAG` across all workflow files. `git diff .github/workflows` shows only `uses:` lines changing.

Manual fallback if pinact is unavailable — for each `uses: OWNER/REPO@TAG`, resolve and replace by hand:
```bash
gh api repos/OWNER/REPO/commits/TAG --jq '.sha'
```
Then edit the line to `uses: OWNER/REPO@<sha> # TAG`.

- [ ] **Step 4: Re-validate all workflows**

Run: `actionlint`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows
git commit -m "ci: pin third-party actions to commit SHAs"
```

---

## Task 9: Document the release process

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Append a "Releasing" section to `CONTRIBUTING.md`**

Add this to the end of the file:

```markdown
## Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please)
and published to npm with provenance via OIDC trusted publishing.

1. Land changes on `main` using **conventional commits** (`feat:`, `fix:`,
   `chore:`, …). `feat:` bumps the minor version, `fix:` the patch version.
2. release-please opens/maintains a **release PR** (`chore: release x.y.z`) that
   bumps `package.json` + `.release-please-manifest.json` and updates the
   changelog.
3. Merge the release PR. The `Release` workflow tags the release and the
   `publish` job runs `npm publish --provenance --access public`. No npm token is
   stored — publishing authenticates via GitHub OIDC.

### One-time setup

- On npmjs.com, add `ebuildy/docusaurus-plugin-gitlab` + `.github/workflows/release.yml`
  as a **trusted publisher** for `@ebuildy/docusaurus-plugin-gitlab`.
- **First publish only:** because the package name does not yet exist on npm, the
  very first publish may need to be bootstrapped manually from a clean checkout:
  `npm ci && npm run build && npm publish --access public` (without
  `--provenance`, which requires CI/OIDC). Subsequent releases publish
  automatically.
```

- [ ] **Step 2: Lint the docs**

Run: `npm run lint:md`
Expected: exit 0 (no markdownlint errors). If it reports issues, run `npm run lint:md -- --fix` and re-check.

- [ ] **Step 3: Commit**

```bash
git add CONTRIBUTING.md
git commit -m "docs: document the automated release process"
```

---

## Task 10: Open a PR and verify the pipeline end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Push the branch and open a PR**

```bash
git push -u origin HEAD
gh pr create --fill
```

- [ ] **Step 2: Watch the CI checks**

Run: `gh pr checks --watch`
Expected: `lint`, `test (18)`, `test (20)`, `test (22)`, `dependency-review`, and `CodeQL` all pass. (The `test` jobs include the ~1min e2e Docusaurus build.)

- [ ] **Step 3: Confirm CodeQL produced results**

Check the PR's checks / the repo Security tab → Code scanning. Expected: a CodeQL run completed (0 or more alerts).

- [ ] **Step 4: Merge and confirm release-please opens a release PR**

After merging this PR to `main`, run: `gh pr list`
Expected: a `chore: release ...` PR opened by release-please appears (driven by the conventional commits on `main`).

- [ ] **Step 5 (gated on one-time npm setup): cut the first release**

Complete the npm trusted-publisher setup + first-publish bootstrap (see Prerequisites / CONTRIBUTING.md), then merge the release PR. Confirm with: `npm view @ebuildy/docusaurus-plugin-gitlab version`
Expected: the published version matches the release tag, and the npm page shows a provenance attestation.

---

## Notes for the executor

- Workflow YAML and config files are not unit-testable; their "tests" are
  `actionlint` (syntax/contract) plus a real PR run (Task 10). Treat a clean
  `actionlint` + green PR checks as the pass criteria.
- Keep commits conventional — release-please derives the next version from them.
- If `npm test` fails in CI only on the e2e step, confirm the `npm run build`
  (root) and `examples/site` `npm ci` steps ran before it; the e2e spawns a real
  `docusaurus build` that loads the freshly built `dist/` via the `file:../..`
  link.
