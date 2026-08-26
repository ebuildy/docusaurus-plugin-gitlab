# `gitlabPublicUrl` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `gitlabPublicUrl` plugin option that replaces every occurrence of the build-time GitLab `host` with a public-facing URL in all build output — structured component data and plain page text alike.

**Architecture:** One new pure module, `src/gitlab/mask-host.ts`, exporting `createHostMask` (string → string, with a `disabled` no-op fast path) and `maskHostDeep` (structural walk over strings/arrays/plain objects). It is applied at exactly **two** choke points: `src/remark/index.ts` around `injectProp`, which covers the structured props of all 11 registered components; and `src/include/loader.ts` on **both** of its `callback` sites, which covers the plain text of every `.md`/`.mdx` in the site. Both sit after the cache, so changing the option takes effect on the next build with no cache clear. `publicUrl` is a different option answering a different question and is **not** touched.

**Tech Stack:** TypeScript (ESM, `moduleResolution: "Bundler"` — intra-package imports need explicit `.js` extensions), Joi for option validation, Vitest for tests, unified/remark for the MDX pipeline.

**Spec:** [`docs/superpowers/specs/2026-08-26-public-url-host-masking-design.md`](../specs/2026-08-26-public-url-host-masking-design.md)
**Issue:** [#44](https://github.com/ebuildy/docusaurus-plugin-gitlab/issues/44)

---

## Background an implementer needs

**`publicUrl` and `gitlabPublicUrl` are different options.** Do not merge them, and do not make `gitlabPublicUrl` default to `host`.

| | `publicUrl` (already exists) | `gitlabPublicUrl` (this plan) |
|---|---|---|
| Means | base URL that relative links in fetched markdown are rewritten to point at | the public face of the GitLab instance named by `host` |
| May be non-GitLab | yes — it can legitimately be the Docusaurus site URL | no — it is the replacement for `host` |
| Consumed by | `resolveRepoLink` ([`src/gitlab/links.ts:77`](../../../src/gitlab/links.ts#L77)), one call site | a global substitution over output strings |
| Default | `host` | `""` (disabled) |

A default of `host` for `gitlabPublicUrl` would make it a permanent no-op. Empty means off — that is what issue #44 asks for ("Do nothing if empty").

**File structure after this plan:**

| File | Responsibility |
|---|---|
| `src/gitlab/mask-host.ts` | **new** — pure host-substitution module. No I/O, no cache, no imports from the rest of the package |
| `src/gitlab/mask-host.test.ts` | **new** — unit tests for the above |
| `src/options.ts` | **modify** — `gitlabPublicUrl` type, Joi rule, default |
| `src/options.test.ts` | **modify** — option tests, plus a guard that `publicUrl` stays independent |
| `src/remark/index.ts` | **modify** — choke point 1: mask `data` / `error` before `injectProp` |
| `src/remark/index.test.ts` | **modify** — tests for choke point 1 |
| `src/include/loader.ts` | **modify** — choke point 2: mask both `callback` return paths |
| `src/include/loader.test.ts` | **modify** — tests for choke point 2 |
| `examples/site/docusaurus.config.ts` | **modify** — read `GITLAB_PUBLIC_URL` from env so the e2e can set it |
| `test/e2e/build.test.ts` | **modify** — a third `describe` block asserting the host is absent from a real build |
| `README.md` | **modify** — options table row + a "Hiding an internal GitLab host" section |

---

## Task 1: The `mask-host` module

**Files:**
- Create: `src/gitlab/mask-host.ts`
- Test: `src/gitlab/mask-host.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/gitlab/mask-host.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createHostMask, maskHostDeep } from "./mask-host.js";

const HOST = "http://gitlab.internal:8080";
const PUBLIC = "https://gitlab.example.com";
const mask = createHostMask(HOST, PUBLIC);

describe("createHostMask", () => {
  it("is disabled when the public url is empty", () => {
    const m = createHostMask(HOST, "");
    expect(m.disabled).toBe(true);
    expect(m(`${HOST}/acme/app`)).toBe(`${HOST}/acme/app`);
  });

  it("is disabled when the public url is undefined", () => {
    expect(createHostMask(HOST, undefined).disabled).toBe(true);
  });

  it("is disabled when the public url equals the host", () => {
    expect(createHostMask(HOST, HOST).disabled).toBe(true);
  });

  it("replaces a single occurrence", () => {
    expect(mask(`${HOST}/acme/app`)).toBe(`${PUBLIC}/acme/app`);
  });

  it("replaces every occurrence, not just the first", () => {
    expect(mask(`a ${HOST}/x b ${HOST}/y`)).toBe(`a ${PUBLIC}/x b ${PUBLIC}/y`);
  });

  it("leaves a non-matching string alone", () => {
    expect(mask("https://gitlab.com/acme/app")).toBe("https://gitlab.com/acme/app");
  });

  it("matches the origin case-insensitively", () => {
    const m = createHostMask("https://GitLab.internal", PUBLIC);
    expect(m("see https://gitlab.internal/acme/app")).toBe(`see ${PUBLIC}/acme/app`);
  });

  it("matches a path prefix case-sensitively", () => {
    const m = createHostMask("https://example.com/GitLab", PUBLIC);
    expect(m("https://example.com/GitLab/acme")).toBe(`${PUBLIC}/acme`);
    expect(m("https://example.com/gitlab/acme")).toBe("https://example.com/gitlab/acme");
  });

  it("replaces the percent-encoded form too", () => {
    expect(mask("https://img.shields.io/b?url=http%3A%2F%2Fgitlab.internal%3A8080%2Fx")).toBe(
      "https://img.shields.io/b?url=https%3A%2F%2Fgitlab.example.com%2Fx",
    );
  });

  it("tolerates lowercase percent-encoding", () => {
    expect(mask("?url=http%3a%2f%2fgitlab.internal%3a8080")).toBe(
      "?url=https%3A%2F%2Fgitlab.example.com",
    );
  });

  it("tolerates trailing slashes on both inputs", () => {
    const m = createHostMask("https://gl.internal/", "https://gl.public/");
    expect(m("https://gl.internal/x")).toBe("https://gl.public/x");
  });
});

describe("maskHostDeep", () => {
  it("walks nested objects and arrays", () => {
    const data = {
      webUrl: `${HOST}/acme/app`,
      count: 3,
      avatarUrl: null,
      assets: [{ name: "bin", url: `${HOST}/acme/app/-/releases/v1/bin` }],
    };
    expect(maskHostDeep(data, mask)).toEqual({
      webUrl: `${PUBLIC}/acme/app`,
      count: 3,
      avatarUrl: null,
      assets: [{ name: "bin", url: `${PUBLIC}/acme/app/-/releases/v1/bin` }],
    });
  });

  it("returns the same object when nothing matched", () => {
    const data = { webUrl: "https://gitlab.com/acme/app", tags: ["a"] };
    expect(maskHostDeep(data, mask)).toBe(data);
  });

  it("returns the input untouched when the mask is disabled", () => {
    const data = { webUrl: `${HOST}/x` };
    expect(maskHostDeep(data, createHostMask(HOST, ""))).toBe(data);
  });

  it("passes non-plain values through by reference", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const out = maskHostDeep({ date, webUrl: `${HOST}/x` }, mask);
    expect(out.date).toBe(date);
    expect(out.webUrl).toBe(`${PUBLIC}/x`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/gitlab/mask-host.test.ts`
Expected: FAIL — `Failed to resolve import "./mask-host.js"`.

- [ ] **Step 3: Write the implementation**

Create `src/gitlab/mask-host.ts`:

```ts
/**
 * Substitutes the build-time GitLab `host` for its public-facing URL
 * (`gitlabPublicUrl`) in output strings. Pure: no I/O, no cache, no imports
 * from the rest of the package.
 *
 * Applied at two choke points — `src/remark/index.ts` (structured component
 * props) and `src/include/loader.ts` (plain page text). See
 * docs/superpowers/specs/2026-08-26-public-url-host-masking-design.md.
 */

export interface HostMask {
  (value: string): string;
  /** True when the mask is a no-op: no host, no public url, or the two are equal. */
  readonly disabled: boolean;
}

const IDENTITY: HostMask = Object.assign((value: string) => value, { disabled: true as const });

/** Escapes regex metacharacters. Introduces no letters, so `expandCase` is safe to run after it. */
function escapeRe(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites every ASCII letter as a two-case character class. This buys
 * case-insensitive matching for ONE part of a pattern; the `i` flag would
 * loosen the whole pattern, and hostnames are case-insensitive while paths
 * are not.
 */
function expandCase(source: string): string {
  return source.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
}

/**
 * Splits a URL into its origin and whatever path follows. `URL` lowercases the
 * host but never changes its length, so slicing the ORIGINAL string by the
 * origin's length preserves the author's casing. A value that does not parse as
 * a URL is treated as all-path, i.e. matched case-sensitively.
 */
function splitOrigin(url: string): [origin: string, rest: string] {
  try {
    const { origin } = new URL(url);
    return [url.slice(0, origin.length), url.slice(origin.length)];
  } catch {
    return ["", url];
  }
}

export function createHostMask(host: string | undefined, gitlabPublicUrl: string | undefined): HostMask {
  const from = (host ?? "").replace(/\/+$/, "");
  const to = (gitlabPublicUrl ?? "").replace(/\/+$/, "");
  if (!from || !to || from === to) return IDENTITY;

  const [origin, rest] = splitOrigin(from);
  const literal = new RegExp(expandCase(escapeRe(origin)) + escapeRe(rest), "g");
  // Badge and shield URLs nest the instance URL inside a query string, where it
  // arrives percent-encoded. encodeURIComponent works per character, so
  // encoding the two halves separately equals encoding the whole. Running
  // expandCase over the encoded form also tolerates lowercase hex (%3a vs %3A).
  const encoded = new RegExp(
    expandCase(escapeRe(encodeURIComponent(origin))) + escapeRe(encodeURIComponent(rest)),
    "g",
  );
  const encodedTo = encodeURIComponent(to);

  const mask = (value: string) => value.replace(literal, to).replace(encoded, encodedTo);
  return Object.assign(mask, { disabled: false as const });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(value: unknown, mask: HostMask): unknown {
  if (typeof value === "string") return mask(value);
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = walk(item, mask);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (isPlainObject(value)) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = walk(item, mask);
      if (next !== item) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
}

/**
 * Structural walk over strings, arrays, and plain objects. Anything else
 * (Date, Map, class instances) passes through by reference. Returns the input
 * unchanged — same reference — when nothing matched, so an unset option costs
 * no allocation.
 */
export function maskHostDeep<T>(value: T, mask: HostMask): T {
  if (mask.disabled) return value;
  return walk(value, mask) as T;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/gitlab/mask-host.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/mask-host.ts src/gitlab/mask-host.test.ts
git commit -S -m "feat(gitlab): add pure host-masking module"
```

---

## Task 2: The `gitlabPublicUrl` option

**Files:**
- Modify: `src/options.ts`
- Test: `src/options.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these to the existing top-level `describe` in `src/options.test.ts`, directly after the `it("rejects a publicUrl that is not a URI", …)` block (around line 158):

```ts
  it("defaults gitlabPublicUrl to an empty string", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "production");
    expect(o.gitlabPublicUrl).toBe("");
  });

  it("does not default gitlabPublicUrl to host", () => {
    const o = resolveOptions({ host: "http://gitlab.internal:8080" }, "production");
    expect(o.gitlabPublicUrl).toBe("");
  });

  it("strips a trailing slash from gitlabPublicUrl", () => {
    const o = resolveOptions(
      { host: "https://gitlab.com", gitlabPublicUrl: "https://public.example.com/" },
      "production",
    );
    expect(o.gitlabPublicUrl).toBe("https://public.example.com");
  });

  it("accepts an explicit empty gitlabPublicUrl", () => {
    const o = resolveOptions({ host: "https://gitlab.com", gitlabPublicUrl: "" }, "production");
    expect(o.gitlabPublicUrl).toBe("");
  });

  it("rejects a gitlabPublicUrl that is not a URI", () => {
    expect(() =>
      resolveOptions({ host: "https://gitlab.com", gitlabPublicUrl: "not a url" }, "production"),
    ).toThrow(/gitlabPublicUrl/);
  });

  // Regression guard: these two options answer different questions. publicUrl
  // may legitimately be the Docusaurus site URL, so gitlabPublicUrl must never
  // feed it, and vice versa.
  it("keeps publicUrl independent of gitlabPublicUrl", () => {
    const o = resolveOptions(
      { host: "http://gitlab.internal:8080", gitlabPublicUrl: "https://public.example.com" },
      "production",
    );
    expect(o.publicUrl).toBe("http://gitlab.internal:8080");
    expect(o.gitlabPublicUrl).toBe("https://public.example.com");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/options.test.ts`
Expected: FAIL, 5 of the 6 new tests — `expected undefined to be ""` and friends, because `gitlabPublicUrl` is not yet on `ResolvedOptions`.

The `rejects a gitlabPublicUrl that is not a URI` test will PASS before the change, for the wrong reason: Joi currently rejects the key as *unknown* with the message `"gitlabPublicUrl" is not allowed`, which also matches `/gitlabPublicUrl/`. It becomes meaningful only after Step 4 adds the schema rule. Do not treat it as the red-phase signal.

- [ ] **Step 3: Add the option type**

In `src/options.ts`, inside `interface PluginOptions`, directly after the existing `publicUrl?: string;` declaration and its doc comment:

```ts
  /** Public GitLab base URL substituted for `host` in **every** build output
   *  string — component props, rendered HTML, and the plain text of every page.
   *  Empty ⇒ no substitution. Distinct from `publicUrl`, which only decides
   *  where relative links point and may be a non-GitLab URL. Output masking
   *  only: the host still appears in build logs and in the on-disk cache.
   *  Default: `""`. */
  gitlabPublicUrl?: string;
```

- [ ] **Step 4: Add it to the resolved type, schema, and defaults**

In `interface ResolvedOptions`, after `publicUrl: string;`:

```ts
  gitlabPublicUrl: string;
```

In `const schema = Joi.object({ … })`, after the `publicUrl` line:

```ts
  gitlabPublicUrl: Joi.string().uri().allow("").optional(),
```

In the object returned by `resolveOptions`, after the `publicUrl` line:

```ts
    // Deliberately NOT `?? opts.host` — that would make the option a permanent
    // no-op. Empty is the documented "off".
    gitlabPublicUrl: (opts.gitlabPublicUrl ?? "").replace(/\/+$/, ""),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/options.test.ts`
Expected: PASS — all existing tests plus the 6 new ones.

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/options.ts src/options.test.ts
git commit -S -m "feat(options): add gitlabPublicUrl option"
```

---

## Task 3: Choke point 1 — mask structured component data

`src/remark/index.ts` injects every component's props through `injectProp`. Masking there covers `webUrl`, `avatarUrl`, release asset links, rendered README/release-note HTML, `GitlabFile` code content, and error messages — for all 11 registered components, without touching a fetcher or a component.

**Files:**
- Modify: `src/remark/index.ts`
- Test: `src/remark/index.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these to the `describe("remarkGitlab", …)` block in `src/remark/index.test.ts`:

```ts
  it("masks the internal host in injected data when gitlabPublicUrl is set", async () => {
    const { fetchProjectInfo } = await import("../gitlab/fetchers.js");
    (fetchProjectInfo as any).mockResolvedValueOnce({
      id: 1,
      path: "g/r",
      name: "r",
      webUrl: "http://gitlab.internal:8080/g/r",
    });
    const tree = await transform('<GitlabProjectInfo project="g/r" />', {
      host: "http://gitlab.internal:8080",
      gitlabPublicUrl: "https://gitlab.example.com",
      strict: true,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabProjectInfo");
    const dataAttr = node.attributes.find((a: any) => a.name === "data");
    expect(dataAttr.value.value).toContain("https://gitlab.example.com/g/r");
    expect(dataAttr.value.value).not.toContain("gitlab.internal");
  });

  it("masks the internal host in an injected error prop", async () => {
    const { fetchIssues } = await import("../gitlab/fetchers.js");
    (fetchIssues as any).mockRejectedValueOnce(
      new Error("connect ECONNREFUSED http://gitlab.internal:8080/api/v4/projects"),
    );
    const tree = await transform('<GitlabIssues project="g/r" />', {
      host: "http://gitlab.internal:8080",
      gitlabPublicUrl: "https://gitlab.example.com",
      strict: false,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabIssues");
    const errAttr = node.attributes.find((a: any) => a.name === "error");
    expect(errAttr.value.value).toContain("https://gitlab.example.com/api/v4/projects");
    expect(errAttr.value.value).not.toContain("gitlab.internal");
  });

  it("leaves injected data untouched when gitlabPublicUrl is unset", async () => {
    const { fetchProjectInfo } = await import("../gitlab/fetchers.js");
    (fetchProjectInfo as any).mockResolvedValueOnce({
      id: 1,
      path: "g/r",
      name: "r",
      webUrl: "http://gitlab.internal:8080/g/r",
    });
    const tree = await transform('<GitlabProjectInfo project="g/r" />', {
      host: "http://gitlab.internal:8080",
      strict: true,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabProjectInfo");
    const dataAttr = node.attributes.find((a: any) => a.name === "data");
    expect(dataAttr.value.value).toContain("http://gitlab.internal:8080/g/r");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/remark/index.test.ts`
Expected: FAIL — the first two: `expected '…gitlab.internal:8080/g/r…' to contain 'https://gitlab.example.com/g/r'`. The third should already PASS (it is the no-regression guard).

- [ ] **Step 3: Write the implementation**

In `src/remark/index.ts`, add the import alongside the existing ones:

```ts
import { createHostMask, maskHostDeep } from "../gitlab/mask-host.js";
```

Build the mask once, next to the existing `const ctx = buildContext(options);`:

```ts
  const ctx = buildContext(options);
  // Output masking, built once per plugin instance. Applied on the way OUT —
  // after the fetchers' cache — so changing the option takes effect on the next
  // build with no node_modules/.cache clear.
  const mask = createHostMask(options.host, options.gitlabPublicUrl);
```

Then replace the body of the `try` block inside the `jobs.map` callback:

```ts
        try {
          const data = maskHostDeep(await fetcher(ctx, attrs), mask);
          injectProp(node, "data", data);
          if (node.name === "GitlabReadme" && Array.isArray((data as any)?.toc)) {
            sidebarReadmes.push({ node, entries: (data as any).toc, order });
          }
        } catch (err) {
```

and the `injectProp` call in the `catch` block:

```ts
          injectProp(node, "error", maskHostDeep({ message, project: String(attrs.project ?? "") }, mask));
```

Note the ordering: `data` is masked **before** the `sidebarReadmes.push`, so the TOC entries handed to `mergeReadmeTocs` come from the same masked object. `TocEntry` carries no URL today (`level`, `id`, `text`), so this is insurance against a future field rather than a live bug — but it costs nothing and removes the question.

Masking the `catch` branch is not incidental: a gitbeaker failure message embeds the request URL, and with `strict: false` that message is rendered into the page by `Fallback`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/remark/index.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/remark/index.ts src/remark/index.test.ts
git commit -S -m "feat(remark): mask the internal host in injected component data"
```

---

## Task 4: Choke point 2 — mask plain page text

The include loader is registered against every `.md`/`.mdx` under `siteDir` (see `buildIncludeLoaderRule` in [`src/plugin/index.ts`](../../../src/plugin/index.ts)), which makes it the one place all page text passes through as a string.

**The trap:** [`src/include/loader.ts`](../../../src/include/loader.ts) early-returns when a file contains no `{@includeGitlab` placeholder — which is most files. The mask must therefore sit at **both** `callback` sites, not inside `transformIncludes`.

**Files:**
- Modify: `src/include/loader.ts`
- Test: `src/include/loader.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these to the `describe("gitlab include loader", …)` block in `src/include/loader.test.ts`:

```ts
  it("masks the internal host on the no-placeholder fast path", async () => {
    const out = await run("clone from http://gitlab.internal:8080/g/r.git", {
      strict: true,
      host: "http://gitlab.internal:8080",
      gitlabPublicUrl: "https://gitlab.example.com",
      cache: false,
    });
    expect(out).toBe("clone from https://gitlab.example.com/g/r.git");
  });

  it("masks the internal host on the transformIncludes path", async () => {
    // The surrounding prose is copied through transformIncludes verbatim, so a
    // mask applied only inside that function would miss it. Deliberately does
    // NOT assert on the failure message's own text, which is network-dependent.
    const out = await run("see http://127.0.0.1:1/g/p\n\n{@includeGitlabReadme: g/p}", {
      strict: false,
      host: "http://127.0.0.1:1",
      gitlabPublicUrl: "https://gitlab.example.com",
      token: undefined,
      cache: false,
      assetDir: "static/gitlab-assets",
      assetBaseUrl: "/gitlab-assets",
    });
    expect(out).toContain("> ⚠️"); // proves we took the transformIncludes path
    expect(out).toContain("see https://gitlab.example.com/g/p");
  });

  it("leaves the source untouched when gitlabPublicUrl is unset", async () => {
    const src = "clone from http://gitlab.internal:8080/g/r.git";
    const out = await run(src, { strict: true, host: "http://gitlab.internal:8080", cache: false });
    expect(out).toBe(src);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/include/loader.test.ts`
Expected: FAIL on the first two — `expected 'clone from http://gitlab.internal:8080/g/r.git' to be 'clone from https://gitlab.example.com/g/r.git'`. The third should already PASS.

- [ ] **Step 3: Write the implementation**

In `src/include/loader.ts`, add the import:

```ts
import { createHostMask } from "../gitlab/mask-host.js";
```

Then rewrite the body of `gitlabIncludeLoader` so both callbacks are masked:

```ts
export default function gitlabIncludeLoader(this: LoaderThis, source: string): void {
  const callback = this.async();
  const { resolved, processorsId } = this.getOptions();
  // Directive-syntax errors here intentionally fail the build fast (unlike the
  // include path's `strict` degrade): a malformed directive is an authoring bug.
  const rewritten = rewriteGeneratePages(source);

  // Output masking for ALL page text. This is the only place every .md/.mdx in
  // the site passes through as a string, so it must wrap BOTH callbacks — the
  // fast path below skips transformIncludes entirely, and that is most files.
  const mask = createHostMask(resolved.host, resolved.gitlabPublicUrl);

  if (!rewritten.includes("{@includeGitlab")) {
    callback(null, mask(rewritten));
    return;
  }

  const options = {
    strict: resolved.strict,
    fixAutolinks: resolved.fixAutolinks,
    fixVoidTags: resolved.fixVoidTags,
    fixInlineStyles: resolved.fixInlineStyles,
    convertAlerts: resolved.convertAlerts,
    stripToc: resolved.stripToc,
    allowedHosts: resolved.includeAllowedHosts,
    debug: resolved.debug,
    outProcessors: processorsId ? getOutProcessors(processorsId) : [],
  };
  transformIncludes(rewritten, getContext(resolved), options).then(
    (out) => callback(null, mask(out)),
    (err) => callback(err instanceof Error ? err : new Error(String(err))),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/include/loader.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Run the whole unit suite**

Run: `pnpm exec vitest run`
Expected: PASS. The e2e file is excluded from neither project, so if `test/e2e/build.test.ts` gets picked up here it will run a real build (slow, ~2 min) — that is fine, but it must stay green.

- [ ] **Step 6: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/include/loader.ts src/include/loader.test.ts
git commit -S -m "feat(include): mask the internal host in all page text"
```

---

## Task 5: End-to-end proof in a real Docusaurus build

Unit tests cannot prove the loader choke point actually runs inside a real bundler. This task builds `examples/site` against the stub GitLab with `gitlabPublicUrl` set and asserts the stub's host appears nowhere in the output.

**Files:**
- Modify: `examples/site/docusaurus.config.ts`
- Modify: `test/e2e/build.test.ts`

> **Do not put this in a new file under `test/e2e/`.** Vitest runs test *files* in parallel, and `.docusaurus/`, `static/gitlab-assets/`, and `docs/generate/` are shared paths between builds of this site. Suites inside one file run sequentially, which is the isolation this needs — the same reason `build.test.ts` already forbids `describe.concurrent` on its variant matrix.

- [ ] **Step 1: Let the fixture site read the option from the environment**

In `examples/site/docusaurus.config.ts`, replace the `gitlabOptions` object with:

```ts
const gitlabOptions = {
  host: process.env.GITLAB_HOST ?? "https://gitlab.com",
  token: process.env.GITLAB_TOKEN,
  strict: true,
  stripToc: true,
  // Spread rather than assigned so the option stays UNSET by default — the
  // existing e2e variants must keep exercising the unmasked path.
  ...(process.env.GITLAB_PUBLIC_URL ? { gitlabPublicUrl: process.env.GITLAB_PUBLIC_URL } : {}),
};
```

- [ ] **Step 2: Write the failing e2e suite**

Append this to the **end** of `test/e2e/build.test.ts`, after the closing `});` of the `describe.each(VARIANTS)` block. It reuses the file-level `siteDir`, `cleanGeneratedPages`, and `runBuild` already defined there:

```ts
/**
 * Masking has to be proven in a real build, not just in unit tests: choke point
 * 2 lives in a webpack/Rspack loader, and its no-placeholder fast path (which
 * most pages take) is only reachable through the bundler.
 *
 * Kept in THIS file rather than its own so it runs sequentially with the
 * variant matrix above — `.docusaurus/`, `static/gitlab-assets/` and
 * `docs/generate/` are shared paths, and vitest parallelises across files.
 */
describe("e2e: gitlabPublicUrl masks the internal host", () => {
  const outDir = "build-masked";
  const publicUrl = "https://gitlab.public.example";
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
      {
        ...process.env,
        DOCUSAURUS_FUTURE_V4: "0",
        GITLAB_HOST: stub.url,
        GITLAB_TOKEN: "",
        GITLAB_PUBLIC_URL: publicUrl,
      },
      outDir,
    );
  }, 300_000);

  afterAll(async () => {
    await stub?.stop();
    rmSync(join(siteDir, outDir), { recursive: true, force: true });
    rmSync(join(siteDir, "static", "gitlab-assets"), { recursive: true, force: true });
    cleanGeneratedPages();
  });

  // Choke point 1: <GitlabReadme> props, injected by the remark plugin.
  it("emits the public url in component data", () => {
    const html = readFileSync(out("index.html"), "utf8");
    expect(html).toContain(`${publicUrl}/group/repo/-/blob/main/CONTRIBUTING.md`);
  });

  // Choke point 2: the {@includeGitlabReadme} body, substituted by the loader.
  it("emits the public url in included page text", () => {
    const html = readFileSync(out("includes", "index.html"), "utf8");
    expect(html).toContain(`${publicUrl}/group/repo/-/blob/main/CONTRIBUTING.md`);
  });

  it("leaves the internal host nowhere in the built pages", () => {
    // A failure here is a genuine leak to track down, not a test to loosen.
    expect(readFileSync(out("index.html"), "utf8")).not.toContain(stub.url);
    expect(readFileSync(out("includes", "index.html"), "utf8")).not.toContain(stub.url);
  });
});
```

- [ ] **Step 3: Run the e2e to verify the new suite fails**

Run: `pnpm exec vitest run test/e2e/build.test.ts`
Expected: the two existing variants PASS; the three new tests FAIL (the built HTML still carries `http://127.0.0.1:<port>/group/repo/-/blob/main/CONTRIBUTING.md`).

This step only proves the *test* is wired up. If Tasks 1–4 are already committed, the suite will pass instead — in that case, temporarily set `GITLAB_PUBLIC_URL` to `""` in the new `beforeAll` to confirm the assertions can fail, then restore it.

Runtime: ~3 minutes (three full Docusaurus builds).

- [ ] **Step 4: Run it again with the implementation in place to verify it passes**

Run: `pnpm exec vitest run test/e2e/build.test.ts`
Expected: PASS, all suites.

- [ ] **Step 5: Commit**

```bash
git add examples/site/docusaurus.config.ts test/e2e/build.test.ts
git commit -S -m "test(e2e): assert gitlabPublicUrl masks the host in a real build"
```

---

## Task 6: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the options-table row**

In the `## Plugin options` table in `README.md`, insert this row immediately **after** the existing `publicUrl` row:

```markdown
| `gitlabPublicUrl` | string | `""` | Public GitLab base URL substituted for `host` in **every** build output string — component props, rendered HTML, and plain page text. Empty ⇒ no substitution. Not the same thing as `publicUrl` — see [Hiding an internal GitLab host](#hiding-an-internal-gitlab-host) |
```

Leave the `publicUrl` row exactly as it is. Its cache caveat is still accurate: `publicUrl` is consumed inside the fetchers, so its value *is* baked into the cache. `gitlabPublicUrl` is applied after the cache and has no such caveat.

- [ ] **Step 2: Add the explainer section**

Insert this immediately after the paragraph that begins "The token is read at build time only", and before `### Customizing the markdown render chain`:

````markdown
### Hiding an internal GitLab host

When the build runs against an internal GitLab that readers cannot reach, set
`gitlabPublicUrl` to the URL they can:

```ts
{
  host: "http://gitlab.internal:8080",             // fetched from, at build time
  gitlabPublicUrl: "https://gitlab.example.com",   // what readers see
}
```

Every occurrence of `host` in the build output is replaced with it: component
props (`webUrl`, release asset links, avatar URLs), rendered README and
release-note HTML, fetch-failure messages shown by the fallback, and the plain
text of every `.md`/`.mdx` page in the site — **including prose and code blocks
you wrote by hand**. Leave it empty (the default) and nothing is substituted.

Because the substitution runs after the on-disk cache, changing it takes effect
on the next build — no need to clear `node_modules/.cache`.

**This is output masking, not a security boundary.** The internal host still
appears in build logs, in `debug` traces, in errors thrown by `strict` mode, and
verbatim in the cache under `node_modules/.cache`. It hides the host from readers
of the published site, not from anyone with access to the build.

**Aliases are not handled.** GitLab builds `web_url` from its own configured
`external_url`, not from the URL your build used to reach it. If the two differ,
that third value is not matched — only the exact `host` string is replaced.

`gitlabPublicUrl` is unrelated to `publicUrl`, which only decides where relative
links in fetched markdown point, and may legitimately be your Docusaurus site URL
rather than a GitLab one.
````

- [ ] **Step 3: Verify the anchor resolves**

Run: `grep -n "hiding-an-internal-gitlab-host\|### Hiding an internal GitLab host" README.md`
Expected: two lines — the table row's link and the heading. GitHub slugifies `### Hiding an internal GitLab host` to `#hiding-an-internal-gitlab-host`.

- [ ] **Step 4: Lint**

Run: `pnpm run lint`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -S -m "docs: document the gitlabPublicUrl option"
```

---

## Task 7: Full verification gate

- [ ] **Step 1: Run the complete suite**

Run: `pnpm exec vitest run`
Expected: PASS, every project (`node` and `jsdom`), including the e2e file.

- [ ] **Step 2: Typecheck**

Run: `pnpm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Lint**

Run: `pnpm run lint`
Expected: exit 0.

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: exit 0, `dist/gitlab/mask-host.js` and `dist/gitlab/mask-host.d.ts` present.

Verify: `ls dist/gitlab/mask-host.*`

- [ ] **Step 5: Confirm every commit is signed**

Run: `git log --format="%G? %s" -7`
Expected: every line starts with `G`.

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin HEAD
gh pr create --fill
```

Then comment on issue #44 with the PR link.

---

## Notes for the implementer

- **Do not add `configureBundler`.** A tripwire test in `src/plugin/index.test.ts` enforces `configureWebpack` until Docusaurus 4 publishes the new signature. This plan does not touch that hook.
- **Do not spread `Map`/`Set` iterators in `src/components/*`.** Not relevant here — nothing in this plan touches `src/components/` — but the `mask-host` module is `tsc`-only Node code and uses no iterators anyway.
- **Explicit `.js` extensions on intra-package imports.** `import { createHostMask } from "../gitlab/mask-host.js"` — required by the `moduleResolution: "Bundler"` ESM setup, even though the source file is `.ts`.
- **Deferred, not in scope:** warning at build end when `gitlabPublicUrl` is set but nothing matched (would surface the alias limitation at build time), and widening the option to accept multiple source hosts. Both are additive and disturb nothing here.
