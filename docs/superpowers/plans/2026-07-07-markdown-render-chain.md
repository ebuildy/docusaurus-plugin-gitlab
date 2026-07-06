# Configurable markdown render chain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single `markdownRenderChain` plugin option that lets users replace the configurable prefix of the build-time markdown pipeline, defaulting to the current chain.

**Architecture:** `markdown.ts` owns the default chain (`defaultMarkdownRenderChain`) and a `chainHasSanitize` guard; `renderMarkdown` applies `opts.renderChain ?? defaultMarkdownRenderChain` then the fixed internal stages. The option is validated in `options.ts` (passed through, default materialized in `markdown.ts`), threaded via `ctx.options` to the four `renderMarkdown` call sites in `fetchers.ts`, and `buildContext` emits a one-time build warning (via lazily-imported `@docusaurus/logger`) when a user-supplied chain omits `rehype-sanitize`.

**Tech Stack:** TypeScript (ESM), unified/remark/rehype, Joi, Vitest, `@docusaurus/logger`.

**Spec:** `docs/superpowers/specs/2026-07-06-markdown-render-chain-design.md`

---

## File Structure

- `src/gitlab/markdown.ts` — **modify.** Export `defaultMarkdownRenderChain` + `chainHasSanitize`; add `renderChain` to `RenderOptions`; build the processor from the configured/default chain.
- `src/gitlab/markdown.test.ts` — **modify.** Tests for custom chain + `chainHasSanitize`.
- `src/options.ts` — **modify.** Add `markdownRenderChain` to `PluginOptions`/`ResolvedOptions`, Joi validation, pass-through in `resolveOptions`.
- `src/options.test.ts` — **modify.** Tests for the new option.
- `src/gitlab/context.ts` — **modify.** Add `warnIfChainMissingSanitize`; copy option onto `ctx.options`; fire warning once.
- `src/gitlab/context.test.ts` — **modify.** Tests for the warning helper.
- `src/gitlab/fetchers.ts` — **modify.** Add `markdownRenderChain` to `GitLabContext.options`; pass `renderChain` at the four `renderMarkdown` call sites.
- `src/gitlab/fetchers.test.ts` — **modify.** Test a configured chain reaches rendered output.
- `README.md` — **modify.** Document the option.

---

## Task 1: Configurable chain + `defaultMarkdownRenderChain` in `markdown.ts`

**Files:**
- Modify: `src/gitlab/markdown.ts`
- Test: `src/gitlab/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/gitlab/markdown.test.ts`. Add these imports at the top (after the existing `import { renderMarkdown } from "./markdown";`):

```typescript
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import { renderMarkdown, defaultMarkdownRenderChain } from "./markdown";
```

(Replace the existing `import { renderMarkdown } from "./markdown";` line with the combined import above.)

Add this test inside the `describe("renderMarkdown", …)` block:

```typescript
  it("uses a custom renderChain verbatim (omitting sanitize lets raw html through)", async () => {
    const html = await renderMarkdown('<b onclick="x()">hi</b>', {
      renderChain: [remarkParse, [remarkRehype, { allowDangerousHtml: true }], rehypeRaw],
    });
    expect(html).toContain("onclick");
    expect(html).toContain("hi");
  });

  it("exports the default chain used when no renderChain is given", async () => {
    expect(defaultMarkdownRenderChain.length).toBe(6);
    const html = await renderMarkdown('<b onclick="x()">hi</b>', {});
    expect(html).not.toContain("onclick");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/markdown.test.ts -t "renderChain"`
Expected: FAIL — `defaultMarkdownRenderChain` is not exported / `renderChain` has no effect.

- [ ] **Step 3: Implement in `src/gitlab/markdown.ts`**

Change the `unified` import to also import the `PluggableList` type:

```typescript
import { unified, type PluggableList } from "unified";
```

Add the exported default chain immediately above `export interface RenderOptions {`:

```typescript
/**
 * The default configurable prefix of the render pipeline: markdown → sanitized
 * hast. Users can spread it (`[...defaultMarkdownRenderChain, myPlugin]`) or
 * replace it wholesale via the `markdownRenderChain` plugin option. The internal
 * stages (TOC, alerts, asset collector, stringify) are appended by
 * `renderMarkdown` and are not part of this list.
 */
export const defaultMarkdownRenderChain: PluggableList = [
  remarkParse,
  remarkGemoji,
  remarkGfm,
  [remarkRehype, { allowDangerousHtml: true }],
  rehypeRaw,
  rehypeSanitize,
];
```

Add `renderChain` to `RenderOptions`:

```typescript
export interface RenderOptions {
  transformImageSrc?: (src: string) => Promise<string>;
  transformLinkHref?: (href: string) => Promise<string>;
  tocMode?: TocMode;
  collectToc?: TocEntry[];
  /** Overrides the default markdown→sanitized-hast plugin chain. */
  renderChain?: PluggableList;
}
```

Replace the processor construction (the six `.use(...)` calls from `remarkParse` through `rehypeSanitize`) with a single `.use()` of the chain, leaving the internal stages untouched:

```typescript
  const processor = unified()
    .use(opts.renderChain ?? defaultMarkdownRenderChain)
    .use(rehypeGitlabToc, { mode: opts.tocMode ?? "auto", collect: opts.collectToc })
    .use(rehypeGitlabAlerts)
    .use(collect)
    .use(rehypeStringify);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/markdown.test.ts`
Expected: PASS — all tests including the existing XSS regression test.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/markdown.ts src/gitlab/markdown.test.ts
git commit -m "feat: make markdown render chain configurable via renderChain"
```

---

## Task 2: `chainHasSanitize` guard in `markdown.ts`

**Files:**
- Modify: `src/gitlab/markdown.ts`
- Test: `src/gitlab/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the imports in `src/gitlab/markdown.test.ts`:

```typescript
import rehypeSanitize from "rehype-sanitize";
import { renderMarkdown, defaultMarkdownRenderChain, chainHasSanitize } from "./markdown";
```

(Merge `chainHasSanitize` into the existing combined `./markdown` import.)

Add a new `describe` block at the end of the file:

```typescript
describe("chainHasSanitize", () => {
  it("is true when rehype-sanitize is present (bare, tuple, or default chain)", () => {
    expect(chainHasSanitize(defaultMarkdownRenderChain)).toBe(true);
    expect(chainHasSanitize([rehypeSanitize])).toBe(true);
    expect(chainHasSanitize([[rehypeSanitize, {}]])).toBe(true);
  });

  it("is false when rehype-sanitize is absent", () => {
    expect(chainHasSanitize([remarkParse])).toBe(false);
    expect(chainHasSanitize([])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/markdown.test.ts -t "chainHasSanitize"`
Expected: FAIL — `chainHasSanitize` is not exported.

- [ ] **Step 3: Implement in `src/gitlab/markdown.ts`**

Add below the `defaultMarkdownRenderChain` export:

```typescript
/**
 * True when `chain` contains `rehype-sanitize` (as a bare plugin or a
 * `[plugin, options]` tuple), matched by reference or by function name. Used to
 * warn when a user-supplied chain would render untrusted GitLab content without
 * sanitization.
 */
export function chainHasSanitize(chain: PluggableList): boolean {
  return chain.some((entry) => {
    const plugin = Array.isArray(entry) ? entry[0] : entry;
    return plugin === rehypeSanitize || (typeof plugin === "function" && plugin.name === "rehypeSanitize");
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/markdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/markdown.ts src/gitlab/markdown.test.ts
git commit -m "feat: add chainHasSanitize guard for render chains"
```

---

## Task 3: `markdownRenderChain` option in `options.ts`

**Files:**
- Modify: `src/options.ts`
- Test: `src/options.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/options.test.ts` inside `describe("resolveOptions", …)`:

```typescript
  it("passes markdownRenderChain through unchanged", () => {
    const chain = [function myPlugin() {}];
    const o = resolveOptions(
      { host: "https://gitlab.com", markdownRenderChain: chain as any },
      "production",
    );
    expect(o.markdownRenderChain).toBe(chain);
  });

  it("leaves markdownRenderChain undefined when not given", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "production");
    expect(o.markdownRenderChain).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options.test.ts -t "markdownRenderChain"`
Expected: FAIL — Joi rejects the unknown option (`markdownRenderChain`) / property missing.

- [ ] **Step 3: Implement in `src/options.ts`**

Add a type-only import at the top (below the existing `OutProcessor` import):

```typescript
import type { PluggableList } from "unified";
```

Add to `PluginOptions` (after `outProcessors?`):

```typescript
  /** Replaces the default markdown→sanitized-hast plugin chain used to render
   *  fetched GitLab markdown (descriptions, release notes, READMEs, files).
   *  Defaults to `defaultMarkdownRenderChain`. Omitting `rehype-sanitize`
   *  disables sanitization of untrusted content (a build warning is emitted). */
  markdownRenderChain?: PluggableList;
```

Add to `ResolvedOptions` (after `debug: boolean;`):

```typescript
  markdownRenderChain?: PluggableList;
```

Add to the Joi `schema` object (after the `outProcessors` line):

```typescript
  markdownRenderChain: Joi.array().items(Joi.alternatives(Joi.function(), Joi.array())).optional(),
```

Add to the object returned by `resolveOptions` (after `debug: opts.debug ?? false,`):

```typescript
    markdownRenderChain: opts.markdownRenderChain,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/options.ts src/options.test.ts
git commit -m "feat: add markdownRenderChain plugin option"
```

---

## Task 4: `warnIfChainMissingSanitize` helper in `context.ts`

**Files:**
- Modify: `src/gitlab/context.ts`
- Test: `src/gitlab/context.test.ts`

- [ ] **Step 1: Write the failing test**

At the very top of `src/gitlab/context.test.ts` (before other imports), add a mock and import the helper + default chain. Replace the existing import block with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveOptions } from "../options.js";
import { buildContext, CACHE_DIR, warnIfChainMissingSanitize } from "./context.js";
import { defaultMarkdownRenderChain } from "./markdown.js";
import remarkParse from "remark-parse";

// `vi.hoisted` is required: a vi.mock factory may not reference an out-of-scope
// variable unless it was created with vi.hoisted.
const warn = vi.hoisted(() => vi.fn());
vi.mock("@docusaurus/logger", () => ({ default: { warn } }));

beforeEach(() => warn.mockClear());
```

Add a new `describe` block:

```typescript
describe("warnIfChainMissingSanitize", () => {
  it("warns when the chain has no rehype-sanitize", async () => {
    await warnIfChainMissingSanitize([remarkParse]);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("rehype-sanitize");
  });

  it("does not warn when the chain contains rehype-sanitize", async () => {
    await warnIfChainMissingSanitize(defaultMarkdownRenderChain);
    expect(warn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/context.test.ts -t "warnIfChainMissingSanitize"`
Expected: FAIL — `warnIfChainMissingSanitize` is not exported.

- [ ] **Step 3: Implement in `src/gitlab/context.ts`**

Add imports at the top:

```typescript
import type { PluggableList } from "unified";
import { chainHasSanitize } from "./markdown.js";
```

Add the helper (below the `CACHE_DIR` export, above `buildContext`):

```typescript
type WarnLogger = { warn: (message: string) => void };

/**
 * Emit a build-time warning when a user-supplied `markdownRenderChain` omits
 * `rehype-sanitize`, so untrusted GitLab content rendered without sanitization
 * is surfaced loudly. `@docusaurus/logger` is imported lazily (optional peer),
 * matching `src/include/logger.ts`.
 */
export async function warnIfChainMissingSanitize(chain: PluggableList): Promise<void> {
  if (chainHasSanitize(chain)) return;
  const imported = (await import("@docusaurus/logger")).default as unknown as WarnLogger & {
    default?: WarnLogger;
  };
  const logger: WarnLogger = imported.default ?? imported;
  logger.warn(
    "@ebuildy/docusaurus-plugin-gitlab: markdownRenderChain has no rehype-sanitize — " +
      "untrusted GitLab content will be rendered without sanitization.",
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/context.ts src/gitlab/context.test.ts
git commit -m "feat: warn when markdownRenderChain omits rehype-sanitize"
```

---

## Task 5: Thread `markdownRenderChain` through context + fetchers

**Files:**
- Modify: `src/gitlab/context.ts`
- Modify: `src/gitlab/fetchers.ts`
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Write the failing test**

Add plugin imports to the top of `src/gitlab/fetchers.test.ts`:

```typescript
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
```

Add this test inside `describe("fetchReleases", …)`:

```typescript
  it("applies a configured markdownRenderChain to release notes", async () => {
    const client = {
      getReleases: vi.fn(async () => [
        { name: "v1", tag_name: "v1", released_at: "x", description: '<b onclick="e()">n</b>',
          upcoming_release: false, assets: { links: [] } },
      ]),
    };
    const c = ctx(client);
    c.options.markdownRenderChain = [remarkParse, [remarkRehype, { allowDangerousHtml: true }], rehypeRaw];
    const data = await fetchReleases(c, { project: "g/r", includePrereleases: true });
    expect(data[0].descriptionHtml).toContain("onclick");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t "configured markdownRenderChain"`
Expected: FAIL — `renderChain` isn't threaded, so sanitize still strips `onclick`.

- [ ] **Step 3: Implement the threading**

In `src/gitlab/fetchers.ts`, add a type-only import at the top:

```typescript
import type { PluggableList } from "unified";
```

Add `markdownRenderChain` to the `GitLabContext.options` type (inside the `options: { … }` block, after `debug?: boolean;`):

```typescript
    markdownRenderChain?: PluggableList;
```

Pass `renderChain` at each of the four `renderMarkdown` call sites:

`fetchProjectInfo` (description):
```typescript
      descriptionHtml: await renderMarkdown(p.description ?? "", { renderChain: ctx.options.markdownRenderChain }),
```

`fetchReleases` (release notes):
```typescript
        descriptionHtml: await renderMarkdown(r.description ?? "", { renderChain: ctx.options.markdownRenderChain }),
```

`fetchReadme` (README) — add `renderChain` to the existing options object:
```typescript
    const html = await renderMarkdown(md, {
      tocMode,
      collectToc,
      transformImageSrc: (src) => ctx.assets.localize(src, ref, project),
      renderChain: ctx.options.markdownRenderChain,
    });
```

`fetchFile` (markdown file) — add `renderChain` to the existing options object:
```typescript
        const html = await renderMarkdown(expanded, {
          transformImageSrc: (src) => ctx.assets.localize(src, ref, String(project)),
          renderChain: ctx.options.markdownRenderChain,
        });
```

In `src/gitlab/context.ts`, thread the option onto `ctx.options` and fire the warning. Update the returned `options` object in `buildContext`:

```typescript
    options: {
      host: options.host,
      strict: options.strict,
      allowedHosts: options.includeAllowedHosts,
      debug: options.debug,
      markdownRenderChain: options.markdownRenderChain,
    },
```

Immediately before the `return { … }` in `buildContext`, add the one-time warning (fire-and-forget; the helper is fully covered by its own test):

```typescript
  if (options.markdownRenderChain) void warnIfChainMissingSanitize(options.markdownRenderChain);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/gitlab/fetchers.test.ts src/gitlab/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS — all tests green, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts src/gitlab/context.ts
git commit -m "feat: thread markdownRenderChain to all render sites"
```

---

## Task 6: Document `markdownRenderChain` in README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add documentation**

Locate the plugin-options documentation in `README.md` (the section listing options such as `host`, `token`, `strict`, `cache`). Add this subsection after the options list/table:

````markdown
### Customizing the markdown render chain

Fetched GitLab markdown (project descriptions, release notes, READMEs, and
markdown files) is rendered at build time by a `unified` plugin chain. By default
it is:

```text
remarkParse → remarkGemoji → remarkGfm → remarkRehype({ allowDangerousHtml })
  → rehypeRaw → rehypeSanitize
```

Override or extend it with the `markdownRenderChain` option. Spread the exported
default to add plugins:

```ts
import { defaultMarkdownRenderChain } from "@ebuildy/docusaurus-plugin-gitlab";
import rehypeHighlight from "rehype-highlight";

// docusaurus.config.ts — plugin options
{
  host: "https://gitlab.com",
  markdownRenderChain: [...defaultMarkdownRenderChain, rehypeHighlight],
}
```

Internal stages (heading anchors/TOC, GitLab alert admonitions, asset
localization, HTML serialization) always run **after** your chain and are not
configurable.

> **Security:** GitLab content is untrusted. The default chain runs
> `rehype-sanitize`. If your custom `markdownRenderChain` omits it, that content
> is rendered **without sanitization** (XSS risk); the plugin emits a build-time
> warning when this is detected. Keep `rehype-sanitize` in the chain unless you
> fully control the GitLab source.
````

- [ ] **Step 2: Verify the export exists**

Confirm `defaultMarkdownRenderChain` is exported from the package entry so the README import works:

Run: `grep -n "defaultMarkdownRenderChain\|markdown" src/index.ts`
Expected: if not already re-exported, add to `src/index.ts`:

```typescript
export { defaultMarkdownRenderChain } from "./gitlab/markdown.js";
```

Then run `npm run typecheck` — Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add README.md src/index.ts
git commit -m "docs: document markdownRenderChain option"
```

---

## Final verification

- [ ] Run the full suite: `npx vitest run` — all green.
- [ ] Typecheck: `npm run typecheck` — no errors.
- [ ] Build: `npm run build` — compiles to `dist/`.
- [ ] E2E (pipeline touched): `npx vitest run test/e2e/build.test.ts` — the real Docusaurus site builds.
