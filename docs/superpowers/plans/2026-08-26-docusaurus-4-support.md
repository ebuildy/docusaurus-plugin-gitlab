# Docusaurus 4 + 3 dual support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@ebuildy/docusaurus-plugin-gitlab` support Docusaurus 3 and the upcoming Docusaurus 4 from a single published version, and prove the Rspack/SWC/LightningCSS path works via a two-variant e2e build matrix.

**Architecture:** The package's coupling to Docusaurus is three plugin hooks (`getClientModules`, `extendCli`, `configureWebpack`) plus one optional, lazily-imported `@docusaurus/logger`. Nothing else is version-specific. So the work is: widen the peer range, refactor the loader-rule construction into a pure function so a future `configureBundler` swap is local, add a tripwire test against double-hook registration, and run the existing e2e site twice — once on Docusaurus 3 defaults (webpack + Babel + cssnano) and once with `future: { v4: true }` (Rspack + SWC + LightningCSS).

**Tech Stack:** TypeScript 6 (ESM-only, `tsc` build), Vitest 4, Docusaurus 3.10.2 example sites, pnpm 11 workspace.

**Spec:** `docs/superpowers/specs/2026-08-25-docusaurus-4-support-design.md`

---

## Background you need

Read this before starting. It is the non-obvious context.

### Why `future: { v4: true }` is the closest thing to Docusaurus 4 today

Docusaurus 4 is **not published**. npm `latest` is `3.10.2`; there is no `next` or `4.x` dist-tag. But 3.10 ships opt-in flags that turn on the v4 behaviour. Verified directly in the installed
`@docusaurus/core@3.10.2/lib/server/configValidation.js`:

- `future.v4: true` expands to `DEFAULT_FUTURE_V4_CONFIG_TRUE`, which sets
  `removeLegacyPostBuildHeadAttribute`, `useCssCascadeLayers`, `siteStorageNamespacing`,
  `fasterByDefault`, and `mdx1CompatDisabledByDefault` all to `true`.
- `fasterByDefault: true` then cascades into **every** `future.faster.*` key —
  `swcJsLoader`, `lightningCssMinimizer`, `rspackBundler`, `rspackPersistentCache`,
  `ssgWorkerThreads` — for any key the user did not set explicitly.

So `future: { v4: true }` alone already switches the bundler to Rspack. You do **not**
need to also write `faster: true`.

`mdx1CompatDisabledByDefault: true` sets `markdown.mdx1Compat` to
`{ comments: false, admonitions: false, headingIds: false }`. The `admonitions: false`
part is what breaks the legacy `:::note Some Title` syntax — hence Task 4.

### The `rspackPersistentCache` trap

`v4: true` also enables `rspackPersistentCache`. A persistent bundler cache across e2e
runs could serve stale output and mask exactly the regressions this matrix exists to
catch. Task 5 disables that one key explicitly. Because the cascade only fills keys the
user left `undefined`, writing `faster: { rspackPersistentCache: false }` keeps every
*other* faster flag at `true`.

### `--out-dir` is a CLI flag, not a config field

There is no `outDir` field in `docusaurus.config.ts`. Output location is set with
`docusaurus build --out-dir <dir>` (confirmed in `@docusaurus/core/lib/commands/cli.js:66`),
relative to the cwd. This is why Task 6 stops calling `pnpm run build` (whose script is a
bare `docusaurus build`) and spawns `pnpm exec docusaurus build --out-dir …` instead.

### Do not add `configureBundler`

Docusaurus 4 deprecates `configureWebpack(...args)` in favour of `configureBundler({...})`,
but the signature is unpublished. If v4 ends up calling *both* hooks, the loader registers
twice and every `.md(x)` file gets include-substitution applied twice. Task 3 adds a test
that fails the moment someone adds the second hook, forcing that decision to be made
deliberately.

---

## File Structure

| File | Change | Responsibility after the change |
|---|---|---|
| `package.json` | Modify | Peer range spans Docusaurus 3 and 4; description mentions both |
| `test/packaging.test.ts` | Modify | Also asserts the Docusaurus peer range |
| `src/plugin/index.ts` | Modify | Adds pure `buildIncludeLoaderRule()`; `configureWebpack` becomes a thin wrapper |
| `src/plugin/index.test.ts` | Modify | Adds the single-rule / no-`configureBundler` tripwire |
| `examples/site/docs/components/readme.mdx` | Modify | Uses the directive admonition-title form that works in both MDX modes |
| `examples/site/docusaurus.config.ts` | Modify | Opts into `future: { v4: true }` when `DOCUSAURUS_FUTURE_V4=1` |
| `.gitignore` | Modify | Ignores the per-variant `examples/*/build-*/` output dirs |
| `test/e2e/build.test.ts` | Modify | Runs the whole assertion suite twice: `classic` and `v4` |
| `README.md` | Modify | Documents Docusaurus 3 + 4 support |
| `docs/ARCHITECTURE.md` | Modify | Mentions the extracted rule builder |
| `CLAUDE.md` | Modify | Scopes the Babel-spread rule to the Babel path |

---

## Task 1: Widen the `@docusaurus/logger` peer range

**Files:**
- Modify: `package.json`
- Test: `test/packaging.test.ts`

- [ ] **Step 1: Write the failing test**

Append this new `describe` block to the end of `test/packaging.test.ts`:

```ts
describe("packaging: Docusaurus compatibility", () => {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );

  it("accepts both Docusaurus 3 and Docusaurus 4 for the optional logger peer", () => {
    // The logger is the package's ONLY @docusaurus/* dependency, it is optional,
    // and it is imported lazily (src/gitlab/context.ts, src/include/logger.ts).
    // Its range is therefore the single thing that decides whether a Docusaurus 4
    // site can install this package without a peer-dependency warning.
    expect(pkg.peerDependencies["@docusaurus/logger"]).toBe("^3.0.0 || ^4.0.0");
  });

  it("keeps the logger peer optional so a site without it still builds", () => {
    expect(pkg.peerDependenciesMeta["@docusaurus/logger"].optional).toBe(true);
  });

  it("declares no @docusaurus/core peer", () => {
    // The package never imports @docusaurus/core. Declaring a peer on it would
    // add install friction and a second version range to keep in sync for no gain.
    expect(pkg.peerDependencies["@docusaurus/core"]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/packaging.test.ts`

Expected: FAIL on the first new test with
`expected '^3.0.0' to be '^3.0.0 || ^4.0.0'`. The other two new tests pass already
(they are characterization assertions locking in behaviour we intend to keep).

- [ ] **Step 3: Widen the range and update the description**

In `package.json`, change the `description` field:

```json
  "description": "MDX extensions to embed GitLab resources in Docusaurus 3 and 4 docs",
```

and the peer range:

```json
  "peerDependencies": {
    "@docusaurus/logger": "^3.0.0 || ^4.0.0",
    "react": ">=18",
    "react-dom": ">=18"
  },
```

Leave `engines` **unchanged** at `"^22.13.0 || >=24.0.0"`. Docusaurus 4 requires Node 24,
but tightening ours would break Docusaurus 3 users on Node 22 for no benefit — the
consuming site's own `engines` already enforces its floor.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/packaging.test.ts`

Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add package.json test/packaging.test.ts
git commit -S -m "feat: accept Docusaurus 4 in the optional logger peer range"
```

---

## Task 2: Extract `buildIncludeLoaderRule()`

Pure refactor. The nine existing cases in `src/plugin/index.test.ts` are the safety net —
they must stay green with **no edits**. If you find yourself changing an existing
assertion, you have changed behaviour and gone wrong.

**Files:**
- Modify: `src/plugin/index.ts:78-117`
- Test: `src/plugin/index.test.ts` (unchanged — used as a regression net)

- [ ] **Step 1: Establish the green baseline**

Run: `pnpm exec vitest run src/plugin/index.test.ts`

Expected: PASS, 13 tests. Note the count; it must be identical after the refactor.

- [ ] **Step 2: Add the pure rule builder**

In `src/plugin/index.ts`, insert this **above** the `export default async function gitlabPlugin`
declaration (i.e. after the `CliLike` interface at line 37):

```ts
type ResolvedRuleOptions = ReturnType<typeof resolveOptions>;

interface IncludeLoaderRule {
  test: RegExp;
  enforce: "pre";
  include: string[];
  use: { loader: string; options: { resolved: ResolvedRuleOptions; processorsId: string } }[];
}

/**
 * Builds the webpack `module.rules` entry that registers the `{@includeGitlab...}`
 * pre-loader.
 *
 * Kept as a pure function, separate from the `configureWebpack` hook, because
 * Docusaurus v4 deprecates `configureWebpack(...args)` in favour of
 * `configureBundler({...})`. When that signature is finally published, the swap
 * is a new wrapper around this function rather than surgery on the hook body.
 * See `docs/superpowers/specs/2026-08-25-docusaurus-4-support-design.md`.
 */
function buildIncludeLoaderRule(args: {
  siteDir: string;
  resolved: ResolvedRuleOptions;
  processorsId: string;
}): IncludeLoaderRule {
  const { siteDir, resolved, processorsId } = args;
  return {
    test: /\.mdx?$/,
    // Must run before Docusaurus's MDX loader: `{@includeGitlab ...}`
    // is not valid MDX, so the placeholder has to be substituted in the
    // raw source text before MDX parsing.
    enforce: "pre" as const,
    // `@docusaurus/core`'s synthetic MDX-fallback plugin
    // (server/plugins/synthetic.js) scans every `.mdx?`-matching
    // rule and flattens its `include` into the fallback rule's
    // `exclude`. Without an explicit `include` here, that flatMap
    // pushes a literal `undefined` into that array (our rule has no
    // `include` of its own) — and the webpack-merge pass that wires
    // the fallback plugin's result back into the config turns that
    // `undefined` hole into `null`, which fails webpack's own
    // config schema and aborts the build. Scoping `include` to the
    // whole site dir keeps our rule's effective reach unchanged
    // (still every `.md`/`.mdx` file in the project) while handing
    // that flatMap a real path instead of `undefined`.
    include: [siteDir],
    use: [
      {
        loader: path.resolve(dirname, "../include/loader.js"),
        options: { resolved, processorsId },
      },
    ],
  };
}
```

- [ ] **Step 3: Replace the hook body with the wrapper**

Replace the whole `configureWebpack(..._args: unknown[]) { ... }` method (currently
`src/plugin/index.ts:78-117`) with:

```ts
    configureWebpack(..._args: unknown[]) {
      return {
        module: {
          rules: [buildIncludeLoaderRule({ siteDir, resolved, processorsId })],
        },
        // Docusaurus merges configureWebpack() results via webpack-merge's
        // default array strategy, which deep-merges `module.rules` by index
        // instead of concatenating — `append` makes it plain-concat so other
        // plugins' rule objects pass through unchanged rather than being
        // merged with ours.
        mergeStrategy: { "module.rules": "append" },
      };
    },
```

- [ ] **Step 4: Run the tests and the typecheck**

Run: `pnpm exec vitest run src/plugin/index.test.ts && pnpm run typecheck`

Expected: PASS, **13 tests**, same count as Step 1. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/plugin/index.ts
git commit -S -m "refactor(plugin): extract buildIncludeLoaderRule from configureWebpack"
```

---

## Task 3: Add the double-registration tripwire

Note on TDD: these two assertions **pass the moment you write them**. That is intentional
and is not a TDD violation — they are characterization tests whose job is to fail *later*,
when someone adds `configureBundler`. Do not fabricate a red step for them.

**Files:**
- Modify: `src/plugin/index.test.ts`

- [ ] **Step 1: Write the tripwire tests**

Add these two cases inside the existing `describe("gitlabPlugin", ...)` block in
`src/plugin/index.test.ts`, directly after the existing
`"appends (not index-merges) module.rules..."` test (currently ends at line 69):

```ts
  it("registers exactly one loader rule", async () => {
    // Guards against the loader being registered twice, which would run
    // include-substitution twice over every .md(x) file in the site.
    const plugin = await gitlabPlugin(ctx, opts);
    const wp = plugin.configureWebpack!({} as any, false, {} as any);
    expect((wp.module!.rules as any[]).length).toBe(1);
  });

  it("exposes configureWebpack and NOT configureBundler", async () => {
    // TRIPWIRE — read before "fixing" this test.
    //
    // Docusaurus v4 deprecates configureWebpack(...args) in favour of
    // configureBundler({...}), but v4 is unpublished and the signature is
    // unknown. We deliberately ship only configureWebpack, which v4 still
    // supports (deprecated != removed).
    //
    // If you add configureBundler, this test fails on purpose. Before deleting
    // it, prove Docusaurus does not call BOTH hooks — if it does, the loader
    // registers twice and every markdown file is processed twice.
    const plugin = await gitlabPlugin(ctx, opts);
    expect(typeof plugin.configureWebpack).toBe("function");
    expect((plugin as Record<string, unknown>).configureBundler).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests**

Run: `pnpm exec vitest run src/plugin/index.test.ts`

Expected: PASS, **15 tests** (13 from Task 2 plus these 2).

- [ ] **Step 3: Commit**

```bash
git add src/plugin/index.test.ts
git commit -S -m "test(plugin): add tripwire against double bundler-hook registration"
```

---

## Task 4: Migrate the legacy admonition title in the example site

`future.v4: true` sets `markdown.mdx1Compat.admonitions = false`, which disables the
legacy `:::note Some Title` parsing. There is exactly one occurrence in the e2e fixture
site. The bracket form `:::note[Some Title]` is the native remark-directive syntax and
works in **both** modes, so this change is safe for the `classic` variant too.

This task must land **before** Task 6, otherwise the `v4` e2e variant fails for a reason
unrelated to this package.

**Files:**
- Modify: `examples/site/docs/components/readme.mdx:50`

- [ ] **Step 1: Change the admonition title to the directive form**

In `examples/site/docs/components/readme.mdx`, change line 50 from:

```mdx
:::note Sidebar mode and broken-anchor checks
```

to:

```mdx
:::note[Sidebar mode and broken-anchor checks]
```

Leave the body and the closing `:::` on line 56 untouched.

- [ ] **Step 2: Verify no other legacy MDX-1 syntax remains in the fixture site**

Run:

```bash
grep -rn '^:::[a-z]* [^[]' examples/site/docs/ ; grep -rn '<!--' examples/site/docs/ ; grep -rnE '^#+ .*\{#' examples/site/docs/
```

Expected: **no output** from any of the three greps. They check the three things
`mdx1Compat` covers — legacy admonition titles, HTML comments, and explicit heading ids.
If any of them prints a line, migrate it the same way before continuing.

- [ ] **Step 3: Commit**

```bash
git add examples/site/docs/components/readme.mdx
git commit -S -m "chore(examples): use the directive admonition-title form"
```

---

## Task 5: Opt the fixture site into the v4 future flags

**Files:**
- Modify: `examples/site/docusaurus.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Parameterise the config**

Replace the whole contents of `examples/site/docusaurus.config.ts` with:

```ts
import type { Config } from "@docusaurus/types";
import gitlabPlugin, { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";

const gitlabOptions = {
  host: process.env.GITLAB_HOST ?? "https://gitlab.com",
  token: process.env.GITLAB_TOKEN,
  strict: true,
  stripToc: true,
};

// The e2e test (test/e2e/build.test.ts) builds this site twice. With this flag
// set it opts into the Docusaurus v4 semantics that 3.10 already exposes:
// `v4: true` turns on removeLegacyPostBuildHeadAttribute, useCssCascadeLayers,
// siteStorageNamespacing, mdx1CompatDisabledByDefault, and fasterByDefault —
// and fasterByDefault cascades into every `faster.*` key, which is what swaps
// webpack for Rspack, Babel for SWC, and cssnano for LightningCSS.
const futureV4 = process.env.DOCUSAURUS_FUTURE_V4 === "1";

const config: Config = {
  title: "GitLab MDX Example",
  url: "https://example.com",
  baseUrl: "/",
  favicon: undefined,
  onBrokenLinks: "ignore",
  markdown: { hooks: { onBrokenMarkdownLinks: "ignore" } },
  ...(futureV4
    ? {
        future: {
          v4: true,
          // `v4: true` would also switch on Rspack's persistent cache. The
          // cascade only fills keys left undefined, so naming this one key
          // keeps every other faster.* flag at true while preventing a stale
          // bundler cache from masking the regressions this matrix exists to
          // catch. (The e2e clears the plugin's own cache between runs.)
          faster: { rspackPersistentCache: false },
        },
      }
    : {}),
  plugins: [[gitlabPlugin, gitlabOptions]],
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [[remarkGitlab, gitlabOptions]],
        },
        blog: false,
        theme: {
          customCss: require.resolve("@ebuildy/docusaurus-plugin-gitlab/theme.css"),
        },
      },
    ],
  ],
};

export default config;
```

- [ ] **Step 2: Ignore the per-variant output directories**

In `.gitignore`, find the line `examples/*/build/` and add a second line directly
after it so the block reads:

```gitignore
examples/*/build/
examples/*/build-*/
examples/*/.docusaurus/
```

- [ ] **Step 3: Verify both variants of the config are valid**

Run:

```bash
pnpm run build
pnpm --filter example-site exec docusaurus build --out-dir build-smoke 2>&1 | tail -5
DOCUSAURUS_FUTURE_V4=1 pnpm --filter example-site exec docusaurus build --out-dir build-smoke-v4 2>&1 | tail -5
```

Expected: both commands reach Docusaurus's own build output. They will very likely
**fail during the GitLab fetch** ("404" / connection errors) because this fixture site
points at stub projects that do not exist on gitlab.com — that is expected and fine at
this step. What you are checking is that **neither fails with a config validation error**
(e.g. `"future.v4" is not allowed`). If you see a config error, the config is wrong; if
you see GitLab fetch errors, move on.

Then clean up: `rm -rf examples/site/build-smoke examples/site/build-smoke-v4`

- [ ] **Step 4: Commit**

```bash
git add examples/site/docusaurus.config.ts .gitignore
git commit -S -m "test(examples): opt the fixture site into v4 future flags via env"
```

---

## Task 6: Turn the e2e into a webpack/Rspack matrix

This is the task that actually proves Docusaurus 4 compatibility. Expect it to be the one
that finds real bugs.

**Files:**
- Modify: `test/e2e/build.test.ts`

- [ ] **Step 1: Rewrite the e2e as a two-variant matrix**

Replace the whole contents of `test/e2e/build.test.ts` with:

```ts
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startGitlabStub } from "./fixtures";

const siteDir = join(process.cwd(), "examples/site");

/**
 * The same site is built twice, so a Docusaurus 4 regression cannot hide behind
 * a passing Docusaurus 3 build (or the reverse).
 *
 * - `classic` is Docusaurus 3 defaults: webpack + Babel + cssnano. This is what
 *   every current user of the package runs.
 * - `v4` sets `future: { v4: true }` in examples/site/docusaurus.config.ts, which
 *   is the closest approximation of Docusaurus 4 available from a published
 *   release: Rspack, SWC, LightningCSS, CSS cascade layers, storage namespacing,
 *   and MDX-1 compatibility off.
 *
 * Each variant builds into its own --out-dir so the two runs cannot collide.
 */
const VARIANTS = [
  { name: "classic", outDir: "build-classic", variantEnv: {} as NodeJS.ProcessEnv },
  { name: "v4", outDir: "build-v4", variantEnv: { DOCUSAURUS_FUTURE_V4: "1" } },
] as const;

// Remove the files the plugin generates into the example's `docs/generate/` folder
// (they sit alongside the committed `index.mdx`, which must be kept).
function cleanGeneratedPages() {
  const dir = join(siteDir, "docs", "generate");
  for (const f of ["repo.mdx", ".gitlab-generated", ".gitignore"]) {
    rmSync(join(dir, f), { force: true });
  }
}

/**
 * Runs the Docusaurus build ASYNCHRONOUSLY and awaits it. We must NOT use
 * execFileSync here: the GitLab stub server runs in this same (vitest) process,
 * and a synchronous child process would block the event loop so the stub could
 * never answer the build's API requests (gitbeaker would retry until timeout).
 *
 * `docusaurus build` is invoked directly rather than through the site's
 * `pnpm run build` script because the output location is a CLI flag
 * (`--out-dir`), not a docusaurus.config.ts field.
 */
function runBuild(env: NodeJS.ProcessEnv, outDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "docusaurus", "build", "--out-dir", outDir], {
      cwd: siteDir,
      stdio: "inherit",
      env,
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`docusaurus build exited with code ${code}`)),
    );
  });
}

describe.each(VARIANTS)("e2e: docusaurus build ($name)", ({ outDir, variantEnv }) => {
  const out = (...parts: string[]) => join(siteDir, outDir, ...parts);
  let stub: Awaited<ReturnType<typeof startGitlabStub>>;

  beforeAll(async () => {
    stub = await startGitlabStub();
    rmSync(join(siteDir, outDir), { recursive: true, force: true });
    rmSync(join(siteDir, "static", "gitlab-assets"), { recursive: true, force: true });
    rmSync(join(siteDir, "node_modules", ".cache", "@ebuildy/docusaurus-plugin-gitlab"), {
      recursive: true,
      force: true,
    });
    rmSync(join(siteDir, ".docusaurus"), { recursive: true, force: true });
    cleanGeneratedPages();
    await runBuild(
      { ...process.env, ...variantEnv, GITLAB_HOST: stub.url, GITLAB_TOKEN: "" },
      outDir,
    );
  }, 300_000);

  afterAll(async () => {
    await stub?.stop();
    rmSync(join(siteDir, outDir), { recursive: true, force: true });
    rmSync(join(siteDir, "static", "gitlab-assets"), { recursive: true, force: true });
    cleanGeneratedPages();
  });

  it("bakes project info, releases, and issues into the static html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    expect(html).toContain("Repo");
    expect(html).toContain("v1.0");
    expect(html).toContain("A bug");
    expect(html).toContain("Readme body");
  });

  it("rewrites the README's relative links to absolute GitLab blob URLs", () => {
    const html = readFileSync(out("index.html"), "utf8");
    expect(html).toContain("/-/blob/main/CONTRIBUTING.md");
  });

  it("downloads and localizes README images into the gitlab-assets dir", () => {
    const assetDir = join(siteDir, "static", "gitlab-assets");
    const files = readdirSync(assetDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  });

  it("references the localized asset path from the built html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    expect(html).toContain("/gitlab-assets/");
  });

  it("merges sidebar README headings into the page's right-hand TOC", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // README headings appear as Docusaurus TOC links, not as an inline gitlab nav.
    expect(html).toContain("table-of-contents");
    expect(html).toContain('href="#install"');
    expect(html).toContain('href="#usage"');
    expect(html).not.toContain("gitlab-md-toc");
    // README heading ids are present in the rendered body for the anchors to resolve.
    expect(html).toContain('id="install"');
  });

  it("interleaves sidebar README headings after the page's own heading in document order", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // The page's own heading and the README headings all appear in the right-hand TOC...
    expect(html).toContain('href="#overview"');
    expect(html).toContain('href="#install"');
    // ...and the README headings come AFTER the page heading that precedes the component.
    expect(html.indexOf('href="#overview"')).toBeLessThan(html.indexOf('href="#install"'));
  });

  it("bakes topics and labels into the static html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // topic explore link + count bubble (robust against Docusaurus's "Docs" navbar label)
    expect(html).toContain("/explore/projects/topics/docs");
    expect(html).toContain("gitlab-count-bubble");
    // project label (cards layout) with its description and issues link
    expect(html).toContain("gitlab-label-card");
    expect(html).toContain("label_name[]=bug");
    expect(html).toContain("New capability");
    // group label with the group issues link
    expect(html).toContain("/groups/my-group/-/issues?label_name[]=epic");
  });

  it("bakes user cards into the static html", () => {
    const html = readFileSync(out("index.html"), "utf8");
    // single card: identity + default profile sections
    expect(html).toContain("Jane Doe");
    // React SSR splits adjacent text/expression children ("@" and {username}) with an
    // <!-- --> comment marker, so assert on the link rather than the contiguous string.
    expect(html).toContain('class="gitlab-user-username" href="https://x/jdoe"');
    expect(html).toContain("12 followers");
    expect(html).toContain("Member since");
    // members grid: both members, role badges, enriched org line
    expect(html).toContain("gitlab-user-cards");
    expect(html).toContain("Bob Martin");
    // role rendered as a badge, not just the word appearing anywhere on the page
    expect(html).toContain('gitlab-user-role">owner');
    expect(html).toContain("Senior Developer · ACME");
  });

  it("generates a child page nested under the declaring index page, with a card grid", () => {
    // The generator wrote the child page as a SIBLING of the declaring index page
    // (docs/generate/index.mdx), so Docusaurus nests it under that page.
    const childSource = join(siteDir, "docs", "generate", "repo.mdx");
    expect(readFileSync(childSource, "utf8")).toContain('<GitlabReadme project="group/repo" />');
    // No leftover subfolder from the old basePath model.
    expect(existsSync(join(siteDir, "docs", "generate", "projects"))).toBe(false);

    // The child page built at /generate/repo and baked in the README.
    const childHtml = readFileSync(out("generate", "repo", "index.html"), "utf8");
    expect(childHtml).toContain("Readme body");

    // The declaring page (/generate/) rendered the card grid linking to the child
    // via a bare slug, which resolves against the page's trailing-slash URL
    // (`/generate/` + `repo` → `/generate/repo`).
    const indexHtml = readFileSync(out("generate", "index.html"), "utf8");
    expect(indexHtml).toContain("gitlab-project-grid");
    expect(indexHtml).toContain('class="gitlab-project-card" href="repo"');
    expect(indexHtml).toContain("Repo");
  });
});
```

Three deliberate changes beyond the mechanical path swap, so you do not "tidy" them away:

1. `stub` moved from module scope into the `describe.each` body — each variant needs its
   own stub, started and stopped around its own build.
2. `.docusaurus/` is now cleared in `beforeAll`. The two variants produce incompatible
   build metadata, and a leftover directory from the other variant can poison the run.
3. The `beforeAll` timeout went from `180_000` to `300_000`. Rspack's first cold build
   plus SSG worker threads is slower than the webpack path on CI runners.

- [ ] **Step 2: Run the classic variant alone first**

Run: `pnpm run build && pnpm exec vitest run test/e2e/build.test.ts -t "classic"`

Expected: PASS, 9 tests. This proves the `--out-dir` swap and the `describe.each`
restructure did not break the path that already worked. **Do not proceed until this is
green** — if it fails, the problem is in your refactor, not in Rspack.

- [ ] **Step 3: Run the v4 variant**

Run: `pnpm exec vitest run test/e2e/build.test.ts -t "v4"`

Expected: PASS, 9 tests.

**This step may genuinely fail, and that is the point of the task.** The spec flags three
predicted failure modes; diagnose against them before inventing a fourth:

| Symptom | Likely cause | Where to look |
|---|---|---|
| Build aborts with a webpack/Rspack **config schema** error mentioning `exclude` or `null` | The `include: [siteDir]` workaround compensates for a webpack-specific quirk in Docusaurus's synthetic MDX-fallback plugin; Rspack's schema may reject a different shape | `buildIncludeLoaderRule` in `src/plugin/index.ts` |
| Build succeeds but `{@includeGitlab...}` placeholders appear **literally** in the HTML | The `enforce: "pre"` loader did not run before Rspack's MDX loader | rule ordering in `buildIncludeLoaderRule` |
| Build fails during **CSS minification** | LightningCSS is stricter than cssnano | `theme.css`, `src/components/styles.module.css` |
| Assertions fail on missing markup only in `v4` | MDX-1 compat is off — some syntax in `examples/site/docs/` still needs migrating | re-run the Task 4 Step 2 greps |

Fix whatever you find, then re-run this step until green. If a fix touches
`src/plugin/index.ts` or the CSS, re-run Step 2 as well — the fix must not regress
`classic`.

- [ ] **Step 4: Run the full suite**

Run: `pnpm exec vitest run && pnpm run typecheck && pnpm run lint`

Expected: all green. The e2e portion now takes roughly 2–3 minutes instead of ~1.
No CI workflow change is needed — `.github/workflows/ci.yml` already runs the e2e
through `pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add test/e2e/build.test.ts
git commit -S -m "test(e2e): build the fixture site on both webpack and Rspack/v4"
```

If Step 3 required source fixes, commit those separately first with a `fix:` message
naming the actual incompatibility.

---

## Task 7: Document the dual support

**Files:**
- Modify: `README.md:8`, `README.md:22`
- Modify: `docs/ARCHITECTURE.md:70`
- Modify: `CLAUDE.md:103-110`

- [ ] **Step 1: Update the README intro and requirements line**

In `README.md`, change the sentence at line 7-9 from:

```markdown
Embed **GitLab** resources — project info, README, releases, issues, and any
file or code snippet — directly in your **Docusaurus 3** documentation using MDX
components.
```

to:

```markdown
Embed **GitLab** resources — project info, README, releases, issues, and any
file or code snippet — directly in your **Docusaurus 3 or 4** documentation using
MDX components.
```

and replace the requirements callout at line 22:

```markdown
> Requires Docusaurus **3.x** and Node **22.13+ or 24**.
```

with:

```markdown
> Requires Docusaurus **3.x or 4.x** and Node **22.13+ or 24** (Docusaurus 4 itself
> requires Node 24).

### Docusaurus compatibility

One published version supports both majors. The package touches only three plugin
hooks (`getClientModules`, `extendCli`, `configureWebpack`) and one optional,
lazily-imported `@docusaurus/logger`; everything else is plain remark/unified and
React, which is version-agnostic.

- **Bundler.** The `{@includeGitlab...}` pre-loader works under both webpack and
  **Rspack**, which Docusaurus 4 uses by default. The e2e suite builds the fixture
  site twice — once on Docusaurus 3 defaults and once with `future: { v4: true }`
  (Rspack + SWC + LightningCSS) — so both paths stay covered.
- **`configureWebpack` is retained on purpose.** Docusaurus 4 deprecates it in
  favour of `configureBundler`, but deprecated is not removed. The package will not
  adopt `configureBundler` until a Docusaurus 4 release publishes its signature,
  because registering both hooks risks running include-substitution twice over every
  markdown file.
- **Nothing else is version-gated.** No `@docusaurus/core` peer dependency is
  declared, and `engines` deliberately still allows Node 22 so Docusaurus 3 users
  are unaffected.
```

- [ ] **Step 2: Update the architecture directory map**

In `docs/ARCHITECTURE.md`, change line 70 from:

```text
│   └── index.ts          hooks: getClientModules, extendCli, configureWebpack; runs generateOnce()
```

to:

```text
│   └── index.ts          hooks: getClientModules, extendCli, configureWebpack (thin wrapper
│                         over the pure buildIncludeLoaderRule()); runs generateOnce()
```

- [ ] **Step 3: Scope the Babel-spread rule in CLAUDE.md**

In `CLAUDE.md`, replace the bullet at lines 103-110 (the one beginning
`- **In \`src/components/*\` (browser-bundled), never spread a \`Map\`/\`Set\` iterator**`)
with:

```markdown
- **In `src/components/*` (browser-bundled), never spread a `Map`/`Set` iterator**
  — use `Array.from(map.values())`, not `[...map.values()]` (same for `.keys()` /
  `.entries()`). Docusaurus bundles these files with Babel, whose loose /
  `iterableIsArray` spread assumption mis-compiles `[...nonArrayIterable]` (a Map
  iterator has no `.length`/indices), yielding a wrong result and runtime errors
  like `Cannot read properties of undefined (reading 'keys')`. `tsc`-only code
  (plugin/remark/`src/gitlab/*`) runs in Node and isn't affected, but prefer
  `Array.from` there too for consistency.
  **This rule stays for as long as Docusaurus 3 is supported.** Docusaurus 4 (and
  Docusaurus 3 with `future.faster`) transpiles with SWC instead of Babel and does
  not have this bug — but the default Docusaurus 3 path still uses Babel, so the
  constraint is not lifted.
```

- [ ] **Step 4: Lint the docs**

Run: `pnpm run lint:md`

Expected: `Summary: 0 error(s)`.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ARCHITECTURE.md CLAUDE.md
git commit -S -m "docs: document Docusaurus 3 and 4 dual support"
```

---

## Final verification

- [ ] **Run the whole gate**

```bash
pnpm run lint && pnpm run typecheck && pnpm run build && pnpm exec vitest run
```

Expected: all green, including **18 e2e tests** (9 assertions × 2 variants).

- [ ] **Confirm every commit is signed**

```bash
git log --format="%G? %h %s" -8
```

Expected: every line starts with `G`.
