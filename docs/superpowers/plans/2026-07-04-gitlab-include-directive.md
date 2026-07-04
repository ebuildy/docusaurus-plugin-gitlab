# GitLab `::include` Directive Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand GitLab `::include{file=…}` directives found inside fetched GitLab READMEs/markdown files into the host document as raw markdown source, at build time.

**Architecture:** `::include` lives inside GitLab markdown pulled in by the webpack-loader include subsystem (`src/include/`). A new `src/include/expand.ts` scans the fetched raw markdown for `::include{file=…}` leaf directives (skipping code regions), resolves each target — a GitLab project file (via the existing `fetchFileSource`) or an allowlisted remote URL (via native `fetch`) — and splices its raw content in place, recursively, with depth + cycle guards. `transformIncludes` (`src/include/transform.ts`) calls the expander on the fetched raw source *before* `renderSource`, so the merged document flows through the existing prose transforms and out-processors as one unit. Hooking in `transform.ts` (not inside `renderSource`) keeps `render-source.ts` free of a back-import and avoids a module cycle.

**Tech Stack:** TypeScript (ESM, `.js` import extensions), Vitest, unified/remark (only reused indirectly via existing `codeRanges`), native `fetch` (Node 20+), Joi (options), `@gitbeaker/rest`.

**Note on the spec:** the design doc places the hook "inside `renderSource`". During file-structure review this was moved one level out to `transformIncludes` to avoid a circular import between `expand.ts` and `render-source.ts` (`expand.ts` imports `codeRanges`/`stripFrontmatter` from `render-source.ts`). The behavior is identical — expansion still happens on the raw source before `processMarkdownSource` runs on the merged document.

---

## File Structure

- **Create** `src/include/expand.ts` — directive scanning, target resolution (GitLab file / remote URL), recursion + guards, error handling. One responsibility: turn raw markdown containing `::include` into raw markdown with those directives expanded.
- **Create** `src/include/expand.test.ts` — unit tests for the above (mocked `fetchFileSource` + `fetch`).
- **Modify** `src/options.ts` — add `includeAllowedHosts` option (interface, Joi, default).
- **Modify** `src/options.test.ts` — cover the new option's default + validation.
- **Modify** `src/include/transform.ts` — add `allowedHosts` to `TransformOptions`; call `expandFileIncludes` on the fetched raw source for markdown includes.
- **Modify** `src/include/transform.test.ts` — cover expansion wiring.
- **Modify** `src/include/loader.ts` — pass `resolved.includeAllowedHosts` into `transformIncludes`.
- **Modify** `README.md` and `examples/gitlab/docs/includes.mdx` — document the feature.

---

## Task 1: Add the `includeAllowedHosts` plugin option

**Files:**
- Modify: `src/options.ts`
- Test: `src/options.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/options.test.ts` inside the `describe("resolveOptions", …)` block:

```ts
it("defaults includeAllowedHosts to an empty array", () => {
  const o = resolveOptions({ host: "https://gitlab.com" }, "production");
  expect(o.includeAllowedHosts).toEqual([]);
});

it("passes through a configured includeAllowedHosts list", () => {
  const o = resolveOptions(
    { host: "https://gitlab.com", includeAllowedHosts: ["example.org"] },
    "production",
  );
  expect(o.includeAllowedHosts).toEqual(["example.org"]);
});

it("rejects a non-array includeAllowedHosts", () => {
  expect(() =>
    resolveOptions(
      { host: "https://gitlab.com", includeAllowedHosts: "example.org" } as any,
      "production",
    ),
  ).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/options.test.ts`
Expected: FAIL — `includeAllowedHosts` is `undefined` / not validated.

- [ ] **Step 3: Implement the option**

In `src/options.ts`:

Add to the `PluginOptions` interface (after `stripToc`):

```ts
  /** Hostnames (exact, case-insensitive) allowed as remote `::include{file=https://…}`
   *  targets inside fetched GitLab markdown. Empty ⇒ remote includes are rejected.
   *  Default: `[]`. */
  includeAllowedHosts?: string[];
```

Add to the `ResolvedOptions` interface (after `stripToc: boolean;`):

```ts
  includeAllowedHosts: string[];
```

Add to the Joi `schema` object (after `stripToc: …`):

```ts
  includeAllowedHosts: Joi.array().items(Joi.string()).optional(),
```

Add to the `resolveOptions` return object (after `stripToc: …`):

```ts
    includeAllowedHosts: opts.includeAllowedHosts ?? [],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/options.ts src/options.test.ts
git commit -S -m "feat: add includeAllowedHosts plugin option"
```

---

## Task 2: Directive attribute parser

**Files:**
- Create: `src/include/expand.ts`
- Test: `src/include/expand.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/include/expand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseIncludeAttrs } from "./expand.js";

describe("parseIncludeAttrs", () => {
  it("reads a bare file value", () => {
    expect(parseIncludeAttrs("file=chapter1.md")).toEqual({ file: "chapter1.md" });
  });
  it("reads a double-quoted file value with spaces", () => {
    expect(parseIncludeAttrs('file="a b.md"')).toEqual({ file: "a b.md" });
  });
  it("reads a single-quoted file value", () => {
    expect(parseIncludeAttrs("file='c.md'")).toEqual({ file: "c.md" });
  });
  it("reads a URL value", () => {
    expect(parseIncludeAttrs("file=https://example.org/x.md")).toEqual({
      file: "https://example.org/x.md",
    });
  });
  it("returns empty when file is absent", () => {
    expect(parseIncludeAttrs("other=1")).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/include/expand.test.ts`
Expected: FAIL — cannot import `parseIncludeAttrs` (module missing).

- [ ] **Step 3: Implement the parser**

Create `src/include/expand.ts`:

```ts
import { fetchFileSource } from "../gitlab/fetchers.js";
import type { GitLabContext } from "../gitlab/fetchers.js";
import { codeRanges, stripFrontmatter } from "./render-source.js";

/** Markdown file extensions whose content is expanded recursively as markdown. */
const MD_EXT = /\.(?:md|mdx|markdown)$/i;

/** Extract the `file=` value from a `::include{…}` attribute string (bare or quoted). */
export function parseIncludeAttrs(attrs: string): { file?: string } {
  const m = /(?:^|\s)file\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(attrs);
  if (!m) return {};
  return { file: m[1] ?? m[2] ?? m[3] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/include/expand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/expand.ts src/include/expand.test.ts
git commit -S -m "feat: parse ::include directive attributes"
```

---

## Task 3: Expand relative GitLab-file includes (single level, code-fence safe)

**Files:**
- Modify: `src/include/expand.ts`
- Test: `src/include/expand.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/include/expand.test.ts` (add imports at the top of the file: `import { vi } from "vitest";` and `import { expandFileIncludes, type ExpandContext, type ExpandGuard } from "./expand.js";`):

```ts
vi.mock("../gitlab/fetchers.js", () => ({
  fetchFileSource: vi.fn(),
}));
import { fetchFileSource } from "../gitlab/fetchers.js";

const mockedFetchFileSource = vi.mocked(fetchFileSource);

function baseCtx(overrides: Partial<ExpandContext> = {}): ExpandContext {
  return {
    ctx: {} as any,
    project: "group/proj",
    ref: "main",
    allowedHosts: [],
    strict: true,
    ...overrides,
  };
}

function baseGuard(): ExpandGuard {
  return { depth: 0, stack: new Set(["group/proj@main/-/README.md"]) };
}

describe("expandFileIncludes — relative GitLab files", () => {
  beforeEach(() => mockedFetchFileSource.mockReset());

  it("replaces a directive with the fetched file's raw content", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "Chapter one body.", ref: "main" });
    const out = await expandFileIncludes(
      "Intro\n\n::include{file=chapter1.md}\n\nOutro",
      baseCtx(),
      baseGuard(),
    );
    expect(out).toContain("Chapter one body.");
    expect(out).not.toContain("::include");
    expect(mockedFetchFileSource).toHaveBeenCalledWith({} as any, {
      project: "group/proj",
      path: "chapter1.md",
      ref: "main",
    });
  });

  it("strips frontmatter from the included file", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "---\ntitle: x\n---\nBody", ref: "main" });
    const out = await expandFileIncludes("::include{file=a.md}", baseCtx(), baseGuard());
    expect(out).toContain("Body");
    expect(out).not.toContain("title: x");
  });

  it("leaves a directive inside a fenced code block untouched", async () => {
    const md = "```\n::include{file=chapter1.md}\n```";
    const out = await expandFileIncludes(md, baseCtx(), baseGuard());
    expect(out).toBe(md);
    expect(mockedFetchFileSource).not.toHaveBeenCalled();
  });

  it("returns the source unchanged when there is no directive", async () => {
    const out = await expandFileIncludes("plain text", baseCtx(), baseGuard());
    expect(out).toBe("plain text");
    expect(mockedFetchFileSource).not.toHaveBeenCalled();
  });
});
```

Also add `import { beforeEach } from "vitest";` to the existing vitest import line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/include/expand.test.ts`
Expected: FAIL — `expandFileIncludes` / types not exported.

- [ ] **Step 3: Implement single-level expansion**

Append to `src/include/expand.ts`:

```ts
export interface ExpandContext {
  ctx: GitLabContext;
  project: string;
  ref: string;
  allowedHosts: string[];
  strict: boolean;
}

export interface ExpandGuard {
  depth: number;
  stack: Set<string>;
}

/** A standalone `::include{…}` leaf directive occupying its own line. */
const INCLUDE_RE = /^[ \t]*::include\{([^}\n]*)\}[ \t]*$/gm;

/** Resolve a directive's target to raw text plus a cycle key and markdown flag. */
async function resolveTarget(
  file: string,
  o: ExpandContext,
): Promise<{ raw: string; key: string; isMarkdown: boolean }> {
  const key = `${o.project}@${o.ref}/-/${file}`;
  const src = await fetchFileSource(o.ctx, { project: o.project, path: file, ref: o.ref });
  return { raw: src.raw, key, isMarkdown: MD_EXT.test(file) };
}

/** Resolve a single directive to its replacement text, honoring `strict`. */
async function resolveOne(
  full: string,
  attrs: string,
  o: ExpandContext,
  _guard: ExpandGuard,
): Promise<string> {
  try {
    const { file } = parseIncludeAttrs(attrs);
    if (!file) throw new Error("::include missing file= attribute");
    const { raw } = await resolveTarget(file, o);
    return stripFrontmatter(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (o.strict) {
      throw new Error(`@ebuildy/docusaurus-plugin-gitlab: ${full} failed — ${message}`);
    }
    return `\n\n> ⚠️ ${full} failed — ${message}\n\n`;
  }
}

/**
 * Replace every standalone `::include{file=…}` directive in `md` (outside code
 * regions) with the raw content of its target. `guard` carries recursion state.
 */
export async function expandFileIncludes(
  md: string,
  o: ExpandContext,
  guard: ExpandGuard,
): Promise<string> {
  const ranges = codeRanges(md);
  const inCode = (i: number) => ranges.some(([s, e]) => i >= s && i < e);

  const matches = [...md.matchAll(INCLUDE_RE)].filter((m) => !inCode(m.index ?? 0));
  if (matches.length === 0) return md;

  const replacements = await Promise.all(
    matches.map((m) => resolveOne(m[0], m[1], o, guard)),
  );

  let out = "";
  let last = 0;
  matches.forEach((m, i) => {
    out += md.slice(last, m.index) + replacements[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + md.slice(last);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/include/expand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/expand.ts src/include/expand.test.ts
git commit -S -m "feat: expand relative GitLab-file ::include directives"
```

---

## Task 4: Remote URL includes with host allowlist

**Files:**
- Modify: `src/include/expand.ts`
- Test: `src/include/expand.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/include/expand.test.ts`:

```ts
describe("expandFileIncludes — remote URLs", () => {
  beforeEach(() => {
    mockedFetchFileSource.mockReset();
    vi.unstubAllGlobals();
  });

  it("expands a remote include from an allowlisted host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "Remote body." })),
    );
    const out = await expandFileIncludes(
      "::include{file=https://example.org/x.md}",
      baseCtx({ allowedHosts: ["example.org"] }),
      baseGuard(),
    );
    expect(out).toContain("Remote body.");
  });

  it("rejects a remote include from a non-allowlisted host (strict throws)", async () => {
    await expect(
      expandFileIncludes(
        "::include{file=https://evil.test/x.md}",
        baseCtx({ allowedHosts: ["example.org"], strict: true }),
        baseGuard(),
      ),
    ).rejects.toThrow(/host not allowed/);
  });

  it("emits a warning marker for a non-allowlisted host when non-strict", async () => {
    const out = await expandFileIncludes(
      "::include{file=https://evil.test/x.md}",
      baseCtx({ allowedHosts: ["example.org"], strict: false }),
      baseGuard(),
    );
    expect(out).toContain("⚠️");
    expect(out).toContain("host not allowed");
  });

  it("errors on a non-OK remote response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, text: async () => "" })),
    );
    await expect(
      expandFileIncludes(
        "::include{file=https://example.org/missing.md}",
        baseCtx({ allowedHosts: ["example.org"], strict: true }),
        baseGuard(),
      ),
    ).rejects.toThrow(/404/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/include/expand.test.ts`
Expected: FAIL — remote branch not implemented (relative path resolution tries `fetchFileSource` with a URL).

- [ ] **Step 3: Add the remote branch to `resolveTarget`**

In `src/include/expand.ts`, replace the body of `resolveTarget` with:

```ts
async function resolveTarget(
  file: string,
  o: ExpandContext,
): Promise<{ raw: string; key: string; isMarkdown: boolean }> {
  if (/^https?:\/\//i.test(file)) {
    const url = new URL(file);
    if (!o.allowedHosts.some((h) => h.toLowerCase() === url.host.toLowerCase())) {
      throw new Error(`::include host not allowed: ${url.host}`);
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url.href} → HTTP ${res.status}`);
    return { raw: await res.text(), key: url.href, isMarkdown: MD_EXT.test(url.pathname) };
  }
  const key = `${o.project}@${o.ref}/-/${file}`;
  const src = await fetchFileSource(o.ctx, { project: o.project, path: file, ref: o.ref });
  return { raw: src.raw, key, isMarkdown: MD_EXT.test(file) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/include/expand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/expand.ts src/include/expand.test.ts
git commit -S -m "feat: support allowlisted remote ::include URLs"
```

---

## Task 5: Recursion, cycle detection, and depth guard

**Files:**
- Modify: `src/include/expand.ts`
- Test: `src/include/expand.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/include/expand.test.ts`:

```ts
describe("expandFileIncludes — recursion + guards", () => {
  beforeEach(() => mockedFetchFileSource.mockReset());

  it("recursively expands includes inside an included markdown file", async () => {
    mockedFetchFileSource.mockImplementation(async (_ctx, args: any) => {
      if (args.path === "a.md") return { raw: "A\n\n::include{file=b.md}", ref: "main" };
      if (args.path === "b.md") return { raw: "B body", ref: "main" };
      throw new Error(`unexpected ${args.path}`);
    });
    const out = await expandFileIncludes("::include{file=a.md}", baseCtx(), baseGuard());
    expect(out).toContain("A");
    expect(out).toContain("B body");
    expect(out).not.toContain("::include");
  });

  it("detects a direct cycle", async () => {
    mockedFetchFileSource.mockResolvedValue({ raw: "loop\n\n::include{file=a.md}", ref: "main" });
    await expect(
      expandFileIncludes("::include{file=a.md}", baseCtx({ strict: true }), baseGuard()),
    ).rejects.toThrow(/cycle detected/);
  });

  it("enforces the max depth", async () => {
    // Every file includes a deeper one, never terminating.
    mockedFetchFileSource.mockImplementation(async (_ctx, args: any) => ({
      raw: `level\n\n::include{file=${args.path}x.md}`,
      ref: "main",
    }));
    await expect(
      expandFileIncludes("::include{file=a.md}", baseCtx({ strict: true }), baseGuard()),
    ).rejects.toThrow(/max depth/);
  });

  it("allows the same file included twice in separate branches (diamond)", async () => {
    mockedFetchFileSource.mockImplementation(async (_ctx, args: any) => {
      if (args.path === "top.md")
        return { raw: "::include{file=shared.md}\n\n::include{file=shared.md}", ref: "main" };
      if (args.path === "shared.md") return { raw: "SHARED", ref: "main" };
      throw new Error(`unexpected ${args.path}`);
    });
    const out = await expandFileIncludes("::include{file=top.md}", baseCtx(), baseGuard());
    expect(out.match(/SHARED/g)?.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/include/expand.test.ts`
Expected: FAIL — recursion not wired; the cycle/depth tests hang or return unexpanded nested directives.

- [ ] **Step 3: Add the depth guard, cycle check, and recursion**

In `src/include/expand.ts`:

Add the constant near `MD_EXT`:

```ts
/** Maximum nesting depth for recursive `::include` expansion. */
export const MAX_INCLUDE_DEPTH = 8;
```

Replace `resolveOne` with:

```ts
async function resolveOne(
  full: string,
  attrs: string,
  o: ExpandContext,
  guard: ExpandGuard,
): Promise<string> {
  try {
    const { file } = parseIncludeAttrs(attrs);
    if (!file) throw new Error("::include missing file= attribute");
    const { raw, key, isMarkdown } = await resolveTarget(file, o);
    if (guard.stack.has(key)) throw new Error(`::include cycle detected: ${key}`);
    let body = stripFrontmatter(raw);
    if (isMarkdown) {
      body = await expandFileIncludes(body, o, {
        depth: guard.depth + 1,
        stack: new Set(guard.stack).add(key),
      });
    }
    return body;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (o.strict) {
      throw new Error(`@ebuildy/docusaurus-plugin-gitlab: ${full} failed — ${message}`);
    }
    return `\n\n> ⚠️ ${full} failed — ${message}\n\n`;
  }
}
```

Add the depth check as the first statement of `expandFileIncludes`:

```ts
export async function expandFileIncludes(
  md: string,
  o: ExpandContext,
  guard: ExpandGuard,
): Promise<string> {
  if (guard.depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`::include exceeded max depth (${MAX_INCLUDE_DEPTH})`);
  }
  const ranges = codeRanges(md);
  // …rest unchanged…
```

Note: because `resolveOne` catches errors, the depth/cycle errors thrown from a
nested `expandFileIncludes` are surfaced through the nearest enclosing directive
— under `strict` they abort the build; otherwise they become a warning marker.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/include/expand.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/expand.ts src/include/expand.test.ts
git commit -S -m "feat: recurse ::include with cycle + depth guards"
```

---

## Task 6: Wire expansion into the include transform pipeline

**Files:**
- Modify: `src/include/transform.ts`
- Modify: `src/include/loader.ts`
- Test: `src/include/transform.test.ts`

- [ ] **Step 1: Write the failing test**

Open `src/include/transform.test.ts` and inspect how it constructs a fake `GitLabContext` and calls `transformIncludes` (follow the existing pattern in that file — it already mocks the client/fetchers). Add a test that a `::include` inside a fetched README is expanded:

```ts
it("expands ::include directives inside a fetched README", async () => {
  // Arrange a context whose README fetch returns markdown containing a directive,
  // and whose chapter fetch returns the included body. Use the same fake-context
  // helper already used by the other tests in this file.
  const ctx = makeCtx({
    files: {
      "group/proj@main/-/README.md": "# Title\n\n::include{file=chapter1.md}",
      "group/proj@main/-/chapter1.md": "Chapter one body.",
    },
  });

  const out = await transformIncludes(
    "{@includeGitlabReadme: group/proj}",
    ctx,
    { strict: true, allowedHosts: [] },
  );

  expect(out).toContain("Chapter one body.");
  expect(out).not.toContain("::include");
});
```

Adapt `makeCtx`/helper names to whatever `transform.test.ts` already defines. If the existing helper cannot express per-path file contents, extend it minimally to do so (matching the file-keying `project@ref/-/path` used by `fetchFileSource`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/include/transform.test.ts`
Expected: FAIL — the README's `::include` is passed through verbatim (still contains `::include`).

- [ ] **Step 3: Wire `expandFileIncludes` into `transformIncludes`**

In `src/include/transform.ts`:

Add the import (next to the other `./` imports):

```ts
import { expandFileIncludes } from "./expand.js";
```

Add `allowedHosts` to `TransformOptions` (after `outProcessors?: …`):

```ts
  /** Hostnames allowed as remote `::include{file=https://…}` targets. Default: none. */
  allowedHosts?: string[];
```

Inside the `Promise.all(...)` callback in `transformIncludes`, replace:

```ts
        const { raw, ref } =
          kind === "readme"
            ? await fetchReadmeSource(ctx, { project: spec.project, ref: spec.ref })
            : await fetchFileSource(ctx, { project: spec.project, path: spec.path!, ref: spec.ref });
        let body = await renderSource(raw, {
          ctx,
          project: spec.project,
          ref,
          kind,
          path: spec.path,
          lineRange: spec.lineRange,
        });
```

with:

```ts
        const { raw, ref } =
          kind === "readme"
            ? await fetchReadmeSource(ctx, { project: spec.project, ref: spec.ref })
            : await fetchFileSource(ctx, { project: spec.project, path: spec.path!, ref: spec.ref });
        let expanded = raw;
        if (isMarkdownSource(kind, spec.path)) {
          expanded = await expandFileIncludes(
            raw,
            {
              ctx,
              project: spec.project,
              ref,
              allowedHosts: options.allowedHosts ?? [],
              strict: options.strict,
            },
            {
              depth: 0,
              stack: new Set([`${spec.project}@${ref}/-/${spec.path ?? "README.md"}`]),
            },
          );
        }
        let body = await renderSource(expanded, {
          ctx,
          project: spec.project,
          ref,
          kind,
          path: spec.path,
          lineRange: spec.lineRange,
        });
```

In `src/include/loader.ts`, add `allowedHosts` to the `options` object built for `transformIncludes` (after `stripToc: resolved.stripToc,`):

```ts
    allowedHosts: resolved.includeAllowedHosts,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/include/transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/transform.ts src/include/loader.ts src/include/transform.test.ts
git commit -S -m "feat: expand ::include inside loader include pipeline"
```

---

## Task 7: Full test + typecheck + e2e verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (all suites, including the new `expand.test.ts` and updated option/transform tests).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: compiles to `dist/` with no errors.

- [ ] **Step 4: e2e build (loader pipeline is touched)**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS (~1 min). Existing includes still render; the added feature does not regress the build.

- [ ] **Step 5: Commit any incidental fixes**

If steps 1–4 required small fixes, commit them:

```bash
git add -A
git commit -S -m "test: verify ::include expansion end-to-end"
```

If nothing changed, skip this step.

---

## Task 8: Documentation

**Files:**
- Modify: `README.md`
- Modify: `examples/gitlab/docs/includes.mdx`

- [ ] **Step 1: Document the feature in README**

Add a subsection under the includes documentation in `README.md` explaining:

```markdown
### `::include` directives inside included markdown

When a fetched GitLab README or markdown file contains a GitLab
[`::include`](https://docs.gitlab.com/user/markdown/#includes) directive, the
plugin expands it at build time, splicing the referenced file in as raw
markdown:

    ::include{file=docs/chapter1.md}

- Relative paths resolve to a file in the **same GitLab project and ref** as the
  enclosing include, fetched through the same cached client.
- Remote URLs (`::include{file=https://…}`) are fetched only when their host is
  listed in the `includeAllowedHosts` plugin option (empty by default, so remote
  includes are off until you opt in).
- Includes are expanded recursively (max depth 8) with cycle detection.
- A failed include aborts the build in `strict` mode, or renders an inline
  warning otherwise.
```

- [ ] **Step 2: Note the behavior in the example site's includes page**

Add a short paragraph to `examples/gitlab/docs/includes.mdx` explaining that any
`::include` directives inside the fetched READMEs are expanded automatically
(no separate placeholder needed). Keep it documentation-only — do not add an
include that depends on upstream content containing `::include`.

- [ ] **Step 3: Commit**

```bash
git add README.md examples/gitlab/docs/includes.mdx
git commit -S -m "docs: document ::include directive expansion"
```

---

## Definition of Done

- `::include{file=…}` inside fetched README/markdown-file includes expands to the referenced content as raw markdown, in both `{@includeGitlabReadme}` and markdown `{@includeGitlabFile}` includes.
- Relative paths resolve to the same project/ref via `fetchFileSource`; remote URLs work only for allowlisted hosts.
- Recursion works with depth (8) and cycle guards; directives inside code fences stay literal.
- `strict` throws on failure; non-strict emits an inline warning marker.
- `npx vitest run`, `npm run typecheck`, `npm run build`, and the e2e build all pass.
- README and example docs updated.
