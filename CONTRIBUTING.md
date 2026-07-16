# Contributing

Thanks for helping improve **@ebuildy/docusaurus-plugin-gitlab**! This guide gets
you from clone to a green build.

## Prerequisites

- **Node 20, 22, or 24** (Docusaurus 3 requires Node 20+) and **pnpm 10**.
  With [mise](https://mise.jdx.dev), `mise install` sets up both (from
  `mise.toml`); otherwise `corepack enable` activates the pnpm version pinned
  in `package.json`'s `packageManager`, or `npm install -g pnpm@10`.
- A GitLab token is **not** required for development (the tests mock the API).
- Optionally, a **Dev Container** (`.devcontainer/`) — open the repo in a container
  with nvm preloaded with Node 20/22/24; switch with `nvm use 22`.

## Setup

```bash
git clone <repo-url>
cd mdx-gitlab-set
pnpm install       # installs the workspace (package + example sites) and the git pre-commit hook (via husky)
pnpm run build     # bundle the package into dist/
```

## Everyday commands

| Command | What it does |
|---|---|
| `pnpm test` | Run all tests (unit + e2e) with Vitest |
| `pnpm exec vitest run --exclude '**/test/e2e/**'` | Unit tests only (fast) |
| `pnpm exec vitest run test/e2e/build.test.ts` | End-to-end only (builds a real Docusaurus site; ~1 min) |
| `pnpm run typecheck` | `tsc --noEmit` |
| `pnpm run lint` | ESLint + markdownlint |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run build` | Compile with tsc (ESM-only + types) |

The example sites have their own READMEs:
[`examples/site`](./examples/site/README.md) (mocked, drives the e2e) and
[`examples/gitlab`](./examples/gitlab/README.md) (live gitlab.com data).

## Conventions

- **TDD**: write the failing test first, then the implementation.
- **ESM**: intra-package imports use explicit `.js` extensions
  (e.g. `import { Fallback } from "./Fallback.js"`).
- **Pure components**: React components render from a `data`/`error` prop only —
  no fetching, no hooks.
- Anything rendered via `dangerouslySetInnerHTML` must go through
  `renderMarkdown` (which sanitizes). Never feed raw API text to it.
- See [`CLAUDE.md`](./CLAUDE.md) for the full architecture, module map, gotchas,
  and a step-by-step recipe for **adding a new component**.

## Pre-commit hook

`pnpm install` sets up a husky pre-commit hook that runs **lint-staged**:
ESLint `--fix` on staged TS/JS and markdownlint on the root docs. If the hook
blocks your commit, run `pnpm run lint:fix` and re-stage.

## Pull requests

Before opening a PR, make sure these pass:

```bash
pnpm run lint && pnpm run typecheck && pnpm test
```

Keep changes focused, and add/adjust tests for any behavior you change.

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

- On npmjs.com, add `ebuildy/docusaurus-plugin-gitlab` +
  `.github/workflows/release.yml` as a **trusted publisher** for
  `@ebuildy/docusaurus-plugin-gitlab`.
- **First publish only:** because the package name does not yet exist on npm, the
  very first publish may need to be bootstrapped manually from a clean checkout:
  `pnpm install --frozen-lockfile && pnpm run build && npm publish --access public`
  (without `--provenance`, which requires CI/OIDC). Subsequent releases publish
  automatically.

## Working with AI (Claude Code)

This repo is set up to be worked on with **[Claude Code](https://claude.com/claude-code)**,
Anthropic's CLI coding agent.

1. **Install the CLI** (once):

   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. **Run it from the repo root**:

   ```bash
   claude
   ```

3. **Project context is automatic.** Claude Code reads
   [`CLAUDE.md`](./CLAUDE.md) on start — it describes the architecture,
   conventions (TDD, ESM `.js` imports, pure components), security rules
   (markdown sanitization), and how to add a component. Keep `CLAUDE.md` updated
   when you change how the project works; it's the agent's source of truth.

4. **Repo helpers.** Project-scoped slash commands and skills live under
   `.claude/`. Claude Code discovers them automatically.

Other agents (Copilot CLI, Gemini CLI, etc.) can also use `CLAUDE.md` as their
project brief. If you add agent-specific config, document it here.
