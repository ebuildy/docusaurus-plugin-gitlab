# Docusaurus 4 support (alongside Docusaurus 3) — design

Date: 2026-08-25
Status: Approved (v1)

## Problem

`@ebuildy/docusaurus-plugin-gitlab` targets Docusaurus 3 only. Docusaurus 4 is
announced but **not yet published** — npm `latest` is `3.10.2`, and there is no
`next`/`4.x` dist-tag. The [v4 umbrella issue][umbrella] (opened 2026-02-06)
lists the planned breaking changes:

- Node 24+, React 19.2+, TypeScript 6+
- **Rspack v2 as the default bundler** (`experimental_faster` graduates to stable
  and becomes the default)
- `configureWebpack(...args)` **deprecated** in favour of `configureBundler({...})`
- MDX v1 compatibility disabled by default
- `localStorage` key namespacing on by default
- DocSearch v4.6+, React Router v8+, `react-helmet-async` v3+, cheerio, jiti,
  tinyglobby, feed v5, sharp
- Removal of the built-in `--bundle-analyzer` CLI option, the Google Analytics
  plugin, and `prop-types` from the client bundle

We want to support **both majors from a single published package**, and we want
to find the breakage now rather than on the day v4 ships.

[umbrella]: https://github.com/facebook/docusaurus/issues/11719

## Goal

1. One published version whose peer range spans Docusaurus 3 and 4.
2. A regression gate that exercises the v4 semantics we can reach today
   (Rspack + SWC + LightningCSS via `future.v4` / `future.faster` on 3.10),
   **without** losing coverage of the plain-webpack path every current user is on.
3. No speculative code against APIs that do not exist yet.

## Non-goals

- No speculative `configureBundler` implementation. The signature is unpublished.
- No dropping of Docusaurus 3. No maintenance fork, no v4-only major.
- No `engines` bump. See "Package metadata" below.
- No tracking of v4 canaries — there are none. Revisit when one is published.

## Compatibility surface

The design rests on one observation: **this package's coupling to Docusaurus is
three plugin hooks and one optional, lazily-imported logger.** Everything else —
the remark/unified pipeline, gitbeaker, the fetchers, the pure components — is
version-agnostic.

The full surface:

| Location | Docusaurus API |
|---|---|
| `src/plugin/index.ts` | `getClientModules`, `extendCli`, `configureWebpack` |
| `src/gitlab/context.ts` | `await import("@docusaurus/logger")` (optional peer) |
| `src/include/logger.ts` | `await import("@docusaurus/logger")` (optional peer) |

Mapping the v4 changes onto that surface:

| v4 change | Impact | Action |
|---|---|---|
| Rspack v2 default | The `enforce: "pre"` loader rule, the `include: [siteDir]` synthetic-MDX-fallback workaround, and `mergeStrategy: { "module.rules": "append" }` have never run under Rspack | prove via the e2e matrix |
| SWC replaces Babel | The `[...map.values()]` Babel mis-compile rule in CLAUDE.md does not apply under Rspack — but D3 without `faster` still uses Babel | **keep the rule**; document its scope |
| LightningCSS replaces cssnano | `theme.css` and `src/components/styles.module.css` meet a stricter parser | e2e matrix catches it |
| `configureWebpack` → `configureBundler` | deprecated, not removed | refactor for a later swap |
| `mdx1CompatDisabledByDefault` | The include loader runs pre-MDX on raw source text, so it should be unaffected | verify via the matrix |
| `siteStorageNamespacing` | no client-side storage in this package | none |
| Node 24 / React 19.2 / TS 6 | already satisfied (`typescript ~6.0.2`, React 19 devDep, peer `react >=18`) | none |
| `onBrokenMarkdownLinks` → `markdown.hooks` | already migrated in `ec6744f` | none |

## Design

### 1. Package metadata

In `package.json`:

- `peerDependencies["@docusaurus/logger"]`: `^3.0.0` → `^3.0.0 || ^4.0.0`.
  It stays **optional** (`peerDependenciesMeta`) and lazily imported, so a
  Docusaurus 4 site resolves it fine and a site without it still works.
- `description`: "Docusaurus 3" → "Docusaurus 3 and 4".
- `engines`: **unchanged** at `^22.13.0 || >=24.0.0`. Docusaurus 4 requires
  Node 24, but tightening ours would break Docusaurus 3 users on Node 22 for no
  benefit — the consuming site's own `engines` already enforces the Node floor.
- **No `@docusaurus/core` peer dependency is added.** The package never imports
  it; adding one only creates install friction and a second range to maintain.

### 2. Plugin hook refactor

Extract the webpack-rule construction out of the `configureWebpack` body in
`src/plugin/index.ts` into a pure function:

```ts
function buildIncludeLoaderRule(args: {
  siteDir: string;
  resolved: ReturnType<typeof resolveOptions>;
  processorsId: string;
}): RuleLike;
```

`configureWebpack` becomes a thin wrapper returning
`{ module: { rules: [buildIncludeLoaderRule(...)] }, mergeStrategy: ... }`.
The rule body — including the `enforce: "pre"` ordering and the `include: [siteDir]`
comment explaining the synthetic-MDX-fallback `flatMap` bug — is carried over
verbatim. This is a pure refactor with no behaviour change; its only purpose is
that adding a `configureBundler` wrapper later is a small, local edit.

**Why not add `configureBundler` now:** if v4 calls *both* hooks, the loader
registers twice and every `.md(x)` file goes through include-substitution twice.
That guard cannot be written or tested against an unpublished signature.

### 3. Tripwire test

Add to `src/plugin/index.test.ts`:

- assert `configureWebpack()` registers **exactly one** rule;
- assert the returned plugin object exposes `configureWebpack` and does **not**
  expose `configureBundler`.

The second assertion is deliberately a tripwire: the day someone adds the second
hook, this test fails and forces an explicit decision about double-registration.

### 4. The e2e matrix

`examples/site/docusaurus.config.ts` reads an environment variable and
conditionally merges:

```ts
future: { v4: true, faster: true }
```

Docusaurus 3.10 graduated `experimental_faster` to `future.faster`; `future.v4: true`
enables `siteStorageNamespacing`, `fasterByDefault`, and `mdx1CompatDisabledByDefault`.
Together these give the closest available approximation of a v4 build: Rspack,
SWC, and LightningCSS.

`test/e2e/build.test.ts` becomes a `describe.each` over two variants:

| Variant | Config | Exercises |
|---|---|---|
| `classic` | Docusaurus 3 defaults | webpack + Babel + cssnano — what current users run |
| `v4` | `future: { v4: true, faster: true }` | Rspack + SWC + LightningCSS |

Each variant builds into its **own output directory** so the two builds cannot
collide and each variant's assertions read its own HTML. Mechanism: `runBuild`
in `test/e2e/build.test.ts` stops calling `pnpm run build` and instead spawns
`pnpm exec docusaurus build --out-dir build-<variant>`, since `outDir` is a CLI
option rather than a `docusaurus.config.ts` field. Every path in the test that
currently reads or removes `examples/site/build` becomes variant-relative.

The existing `beforeAll`/`afterAll` setup — GitLab stub, cache clearing,
generated-page cleanup — moves inside the `describe.each` body so each variant
starts clean. `examples/site/.gitignore` gains the `build-*` pattern.

Cost: roughly ~1 min → ~2.5 min for `pnpm test`. **No CI workflow change is
needed** — `.github/workflows/ci.yml` already runs the e2e through `pnpm test`
on the Node 22 and 24 matrix.

The showcase site (`examples/gitlab`) stays on defaults. It fetches live
gitlab.com data and is not a deterministic regression gate.

### 5. Documentation

- README: a "Docusaurus compatibility" section stating support for Docusaurus 3
  (≥3.0) and 4, Rspack compatibility, and that `configureWebpack` is deliberately
  retained rather than replaced.
- `docs/ARCHITECTURE.md`: update the `src/plugin/index.ts` hook line to mention
  the extracted rule builder.
- `CLAUDE.md`: amend the Babel-spread rule to state that it applies to the
  Babel path (Docusaurus 3 without `faster`) and must be kept for as long as
  Docusaurus 3 is supported, even though the Rspack/SWC path is unaffected.

## Testing strategy

| Change | Verification |
|---|---|
| Rule-builder refactor | existing `src/plugin/index.test.ts` cases pass unchanged |
| Single-rule / no-`configureBundler` | new unit assertions |
| Peer range widening | new assertion in `test/packaging.test.ts` (it currently makes no peer-dependency assertions) |
| Rspack / SWC / LightningCSS compatibility | `v4` e2e variant |
| No regression for Docusaurus 3 users | `classic` e2e variant |

TDD order: write the failing tripwire test and the `v4` e2e variant first, then
make them pass.

## Risks and open questions

1. **The Rspack path may not pass on the first try.** The `include: [siteDir]`
   workaround exists for a webpack-specific quirk in Docusaurus's synthetic
   MDX-fallback plugin (`server/plugins/synthetic.js`), which flattens every
   `.mdx?`-matching rule's `include` into the fallback rule's `exclude`. Whether
   Rspack's config schema reproduces the same `undefined` → `null` failure is
   unknown. Fixing whatever the matrix surfaces is **in scope**, but the shape of
   that fix cannot be specified in advance.
2. **`future.v4: true` on 3.10 is an approximation, not v4.** It cannot cover
   removed APIs, the Rspack v1 → v2 upgrade, or the dependency bumps. Passing the
   `v4` variant raises confidence; it does not prove v4 compatibility.
3. **LightningCSS is stricter than cssnano.** If `theme.css` or
   `styles.module.css` contain anything it rejects, the `v4` variant fails and
   the CSS needs fixing. Low risk, but real.
4. **`configureBundler` remains unresolved by design.** This spec defers it;
   a follow-up change is required once a v4 canary publishes the signature.
