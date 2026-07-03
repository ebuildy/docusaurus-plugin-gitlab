# GitLab Include Placeholders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add build-time markdown placeholders `{@includeGitlabReadme: …}` / `{@includeGitlabFile: …}` that splice GitLab content into a page as source text *before* MDX parsing, so Docusaurus's native pipeline (TOC, emoji, admonitions, heading anchors, Prism) processes it.

**Architecture:** A new Docusaurus **plugin** registers an **async webpack loader** (the only pre-parse hook supporting `this.async()`; `{@…}` is invalid MDX so a remark plugin cannot see it). The loader regex-matches placeholders, fetches raw markdown/file text via the existing `GitLabClient`/`FileCache`/`AssetManager`, strips frontmatter, localizes images, absolutizes links, MDX-escapes prose (code untouched), and substitutes text. Existing remark plugin and the five JSX components are untouched (additive). Spec: `docs/superpowers/specs/2026-06-30-gitlab-include-placeholders-design.md`.

**Tech Stack:** TypeScript (ESM-only, `.js` import extensions), unified/remark (mdast), Docusaurus 3 plugin API, webpack 5 loader, Vitest.

**Conventions (from CLAUDE.md):** ESM-first, intra-package imports use explicit `.js`. Keep files focused. TDD: failing test → minimal impl → green → commit. After edits run `npx vitest run <file>` and `npm run typecheck`. The e2e (`test/e2e/build.test.ts`) is slow; run explicitly.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/gitlab/context.ts` | `buildContext(resolved)` + `CACHE_DIR`, shared by remark + include paths | Create (extract from `src/remark/index.ts`) |
| `src/gitlab/code.ts` | `applyLineRange`, `languageFromPath`, `LANGUAGE_BY_EXTENSION` | Create (extract from `src/gitlab/fetchers.ts`) |
| `src/gitlab/fetchers.ts` | Add `fetchReadmeSource` / `fetchFileSource` (raw text, memoized) | Modify |
| `src/include/grammar.ts` | `parseInclude(kind, raw)` → `IncludeSpec` | Create |
| `src/include/render-source.ts` | `stripFrontmatter`, `codeRanges`, `processMarkdownSource`, `renderSource` | Create |
| `src/include/transform.ts` | `transformIncludes(source, ctx, resolved)` — find/fetch/substitute | Create |
| `src/include/context.ts` | `getContext(resolved)` — memoized context singleton for the loader | Create |
| `src/include/loader.ts` | Thin async webpack loader calling `transformIncludes` | Create |
| `src/plugin/index.ts` | Docusaurus plugin: `configureWebpack` (loader) + `getClientModules` (theme.css) | Create |
| `src/index.ts` | Add `export { default }` (plugin) | Modify |
| `package.json` | Add `./plugin` export | Modify |
| `examples/site/docusaurus.config.ts` | Register plugin + `remark-gemoji` for the e2e | Modify |
| `examples/site/docs/includes.mdx` | Example page using both placeholders | Create |
<<<<<<< HEAD
| `examples/gitlab/docusaurus.config.ts` | Register plugin + `remark-gemoji` for the e2e | Modify |
| `examples/gitlab/docs/includes.mdx` | Example page using both placeholders | Create |
=======
>>>>>>> main
| `test/e2e/fixtures.ts` | Add an emoji + a fenced range file to the stub README/file | Modify |
| `test/e2e/build.test.ts` | Assert native heading anchors + emoji from the included content | Modify |
| `README.md`, `examples/gitlab/docs/*` | Document the placeholders | Modify |

---

## Task 1: Extract `buildContext` into a shared module

**Files:**
- Create: `src/gitlab/context.ts`
- Modify: `src/remark/index.ts:12-25`
- Test: `src/gitlab/context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/gitlab/context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildContext, CACHE_DIR } from "./context.js";
import { resolveOptions } from "../options.js";

describe("buildContext", () => {
  it("builds a context with client, cache, assets and host", () => {
    const resolved = resolveOptions({ host: "https://gitlab.example.com" }, "development");
    const ctx = buildContext(resolved);
    expect(ctx.client).toBeDefined();
    expect(ctx.cache).toBeDefined();
    expect(ctx.assets).toBeDefined();
    expect(ctx.options.host).toBe("https://gitlab.example.com");
  });

  it("exposes the cache dir under node_modules/.cache", () => {
    expect(CACHE_DIR).toContain("node_modules/.cache/@ebuildy/docusaurus-plugin-gitlab");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/context.test.ts`
Expected: FAIL — cannot resolve `./context.js`.

- [ ] **Step 3: Create `src/gitlab/context.ts`**

```ts
import { AssetManager } from "./assets.js";
import { FileCache } from "./cache.js";
import { GitLabClient } from "./client.js";
import type { GitLabContext } from "./fetchers.js";
import type { ResolvedOptions } from "../options.js";

export const CACHE_DIR = "node_modules/.cache/@ebuildy/docusaurus-plugin-gitlab";

export function buildContext(options: ResolvedOptions): GitLabContext {
  const client = new GitLabClient({ host: options.host, token: options.token });
  const cache = new FileCache(CACHE_DIR, options.cache);
  const assets = new AssetManager({
    client,
    cache,
    assetDir: options.assetDir,
    assetBaseUrl: options.assetBaseUrl,
    host: options.host,
  });
  return { client, cache, assets, options: { host: options.host } };
}
```

- [ ] **Step 4: Update `src/remark/index.ts` to reuse it**

Replace the local `CACHE_DIR` const and `buildContext` function (lines 12-25) with an import. The top of the file's imports should drop the now-unused `AssetManager`, `FileCache`, `GitLabClient` imports and add:

```ts
import { buildContext } from "../gitlab/context.js";
```

Remove the `const CACHE_DIR = …` line and the entire `function buildContext(...) { … }` block. The `transformer`/`remarkGitlab` body is unchanged (it still calls `buildContext(options)`).

- [ ] **Step 5: Run tests to verify green**

Run: `npx vitest run src/gitlab/context.test.ts src/remark/index.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/context.ts src/gitlab/context.test.ts src/remark/index.ts
git commit -m "refactor: extract buildContext into src/gitlab/context.ts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Extract code/markdown helpers into a shared module

**Files:**
- Create: `src/gitlab/code.ts`
- Modify: `src/gitlab/fetchers.ts:125-201`
- Test: `src/gitlab/code.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/gitlab/code.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { applyLineRange, languageFromPath } from "./code.js";

describe("applyLineRange", () => {
  it("returns whole text when no range", () => {
    expect(applyLineRange("a\nb\nc")).toBe("a\nb\nc");
  });
  it("slices an inclusive 1-based range", () => {
    expect(applyLineRange("a\nb\nc\nd", "2-3")).toBe("b\nc");
  });
  it("slices a single line", () => {
    expect(applyLineRange("a\nb\nc", "2")).toBe("b");
  });
  it("ignores a malformed range", () => {
    expect(applyLineRange("a\nb", "xyz")).toBe("a\nb");
  });
});

describe("languageFromPath", () => {
  it("maps known extensions", () => {
    expect(languageFromPath("src/foo.ts")).toBe("ts");
    expect(languageFromPath("a/b/main.py")).toBe("python");
    expect(languageFromPath("x.yml")).toBe("yaml");
  });
  it("falls back to the raw extension", () => {
    expect(languageFromPath("file.unknownext")).toBe("unknownext");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/code.test.ts`
Expected: FAIL — cannot resolve `./code.js`.

- [ ] **Step 3: Create `src/gitlab/code.ts`**

Move the three members out of `fetchers.ts` verbatim:

```ts
export function applyLineRange(text: string, lines?: string): string {
  if (!lines) return text;
  const match = /^(\d+)(?:-(\d+))?$/.exec(lines.trim());
  if (!match) return text;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  const allLines = text.split("\n");
  return allLines.slice(start - 1, end).join("\n");
}

export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js",
  py: "python", go: "go", rs: "rust", java: "java", rb: "ruby", php: "php",
  c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp",
  json: "json", yml: "yaml", yaml: "yaml", toml: "toml", sh: "bash", bash: "bash",
  md: "markdown", mdx: "markdown", html: "html", css: "css", scss: "scss",
  sql: "sql", kt: "kotlin", swift: "swift", xml: "xml", dockerfile: "dockerfile",
};

export function languageFromPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  const dotIndex = base.lastIndexOf(".");
  const ext = (dotIndex === -1 ? base : base.slice(dotIndex + 1)).toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext] ?? ext ?? "text";
}
```

- [ ] **Step 4: Update `src/gitlab/fetchers.ts`**

Delete the `applyLineRange`, `LANGUAGE_BY_EXTENSION`, and `languageFromPath` definitions (lines 125-177). Add an import near the top:

```ts
import { applyLineRange, languageFromPath } from "./code.js";
```

`fetchFile` keeps calling `applyLineRange(raw, lines)` and `languageFromPath(path)` unchanged.

- [ ] **Step 5: Run tests to verify green**

Run: `npx vitest run src/gitlab/code.test.ts src/gitlab/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/code.ts src/gitlab/code.test.ts src/gitlab/fetchers.ts
git commit -m "refactor: extract line-range and language helpers into src/gitlab/code.ts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Raw-source fetchers

**Files:**
- Modify: `src/gitlab/fetchers.ts`
- Test: `src/gitlab/fetchers.test.ts`

These return **raw** README/file text plus the resolved ref (needed later for asset localization and link absolutization), memoized through the cache — distinct from `fetchReadme`/`fetchFile`, which produce HTML.

- [ ] **Step 1: Write the failing test**

Append to `src/gitlab/fetchers.test.ts` (reuse the file's existing fake-context helpers; if the file builds its context inline, mirror that style). Add:

```ts
import { fetchReadmeSource, fetchFileSource } from "./fetchers.js";

function makeCtx(overrides: Partial<any> = {}) {
  const store = new Map<string, unknown>();
  return {
    client: {
      getProject: async () => ({ default_branch: "main" }),
      getFileRaw: async (_p: unknown, path: string, ref: string) => `RAW:${path}@${ref}`,
      ...overrides.client,
    },
    cache: {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: unknown) => void store.set(k, v),
    },
    assets: {} as any,
    options: { host: "https://gitlab.example.com" },
  } as any;
}

describe("fetchReadmeSource", () => {
  it("fetches README.md raw at the default branch", async () => {
    const r = await fetchReadmeSource(makeCtx(), { project: "g/p" });
    expect(r).toEqual({ raw: "RAW:README.md@main", ref: "main" });
  });
  it("honors an explicit ref", async () => {
    const r = await fetchReadmeSource(makeCtx(), { project: "g/p", ref: "v2" });
    expect(r).toEqual({ raw: "RAW:README.md@v2", ref: "v2" });
  });
});

describe("fetchFileSource", () => {
  it("fetches an arbitrary file path", async () => {
    const r = await fetchFileSource(makeCtx(), { project: "g/p", path: "src/a.ts" });
    expect(r).toEqual({ raw: "RAW:src/a.ts@main", ref: "main" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: FAIL — `fetchReadmeSource`/`fetchFileSource` are not exported.

- [ ] **Step 3: Implement in `src/gitlab/fetchers.ts`**

Add at the end of the file:

```ts
export interface SourceResult {
  raw: string;
  ref: string;
}

export async function fetchReadmeSource(
  ctx: GitLabContext,
  args: { project: string; ref?: string },
): Promise<SourceResult> {
  return memo(ctx, `readmeSource:${args.project}:${args.ref ?? "default"}`, async () => {
    const ref = args.ref ?? (await ctx.client.getProject(args.project)).default_branch;
    const raw = await ctx.client.getFileRaw(args.project, "README.md", ref);
    return { raw, ref } satisfies SourceResult;
  });
}

export async function fetchFileSource(
  ctx: GitLabContext,
  args: { project: string; path: string; ref?: string },
): Promise<SourceResult> {
  return memo(ctx, `fileSource:${args.project}:${args.path}:${args.ref ?? "default"}`, async () => {
    const ref = args.ref ?? (await ctx.client.getProject(args.project)).default_branch;
    const raw = await ctx.client.getFileRaw(args.project, args.path, ref);
    return { raw, ref } satisfies SourceResult;
  });
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: add raw-source fetchers for include placeholders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Placeholder grammar parser

**Files:**
- Create: `src/include/grammar.ts`
- Test: `src/include/grammar.test.ts`

Grammar: `[ref@]group/.../project[/-/path][#Lstart-end]`. Readme takes no `/-/path`; file requires one. `#L…` (file only) becomes the `"start-end"` form understood by `applyLineRange`.

- [ ] **Step 1: Write the failing test**

Create `src/include/grammar.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseInclude } from "./grammar.js";

describe("parseInclude readme", () => {
  it("parses a bare project", () => {
    expect(parseInclude("readme", "g/p")).toEqual({ kind: "readme", project: "g/p" });
  });
  it("parses a nested group project", () => {
    expect(parseInclude("readme", "g/sub/p")).toEqual({ kind: "readme", project: "g/sub/p" });
  });
  it("parses a ref prefix (ref may contain a slash)", () => {
    expect(parseInclude("readme", "feat/x@g/p")).toEqual({ kind: "readme", project: "g/p", ref: "feat/x" });
  });
  it("rejects a file path", () => {
    expect(() => parseInclude("readme", "g/p/-/README.md")).toThrow();
  });
  it("rejects empty input", () => {
    expect(() => parseInclude("readme", "")).toThrow();
  });
});

describe("parseInclude file", () => {
  it("splits project and path on /-/", () => {
    expect(parseInclude("file", "g/sub/p/-/src/a.ts")).toEqual({
      kind: "file", project: "g/sub/p", path: "src/a.ts",
    });
  });
  it("parses ref + path + line range", () => {
    expect(parseInclude("file", "v1.2@g/p/-/src/a.ts#L10-25")).toEqual({
      kind: "file", project: "g/p", path: "src/a.ts", ref: "v1.2", lineRange: "10-25",
    });
  });
  it("parses a single-line range", () => {
    expect(parseInclude("file", "g/p/-/a.ts#L7")).toEqual({
      kind: "file", project: "g/p", path: "a.ts", lineRange: "7",
    });
  });
  it("requires a /-/ path", () => {
    expect(() => parseInclude("file", "g/p")).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/include/grammar.test.ts`
Expected: FAIL — cannot resolve `./grammar.js`.

- [ ] **Step 3: Create `src/include/grammar.ts`**

```ts
export interface IncludeSpec {
  kind: "readme" | "file";
  project: string;
  ref?: string;
  path?: string;
  lineRange?: string;
}

export function parseInclude(kind: "readme" | "file", rawSpec: string): IncludeSpec {
  let spec = rawSpec.trim();

  let lineRange: string | undefined;
  if (kind === "file") {
    const m = /#L(\d+)(?:-(\d+))?$/.exec(spec);
    if (m) {
      lineRange = m[2] ? `${m[1]}-${m[2]}` : m[1];
      spec = spec.slice(0, m.index);
    }
  }

  let ref: string | undefined;
  const at = spec.indexOf("@");
  if (at > 0) {
    ref = spec.slice(0, at);
    spec = spec.slice(at + 1);
  } else if (at === 0) {
    throw new Error(`empty ref before "@" in "${rawSpec}"`);
  }

  if (kind === "readme") {
    if (spec.includes("/-/")) {
      throw new Error(`includeGitlabReadme takes a project only, not a file path: "${rawSpec}"`);
    }
    if (!spec) throw new Error(`includeGitlabReadme: missing project in "${rawSpec}"`);
    return { kind, project: spec, ...(ref ? { ref } : {}) };
  }

  const sep = spec.indexOf("/-/");
  if (sep === -1) {
    throw new Error(`includeGitlabFile requires a "/-/<path>": "${rawSpec}"`);
  }
  const project = spec.slice(0, sep);
  const path = spec.slice(sep + 3);
  if (!project || !path) throw new Error(`includeGitlabFile: malformed spec "${rawSpec}"`);
  return { kind, project, path, ...(ref ? { ref } : {}), ...(lineRange ? { lineRange } : {}) };
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/include/grammar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/grammar.ts src/include/grammar.test.ts
git commit -m "feat: add include placeholder grammar parser

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Markdown source processing — frontmatter strip + code-range detection

**Files:**
- Create: `src/include/render-source.ts`
- Test: `src/include/render-source.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/include/render-source.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripFrontmatter, codeRanges } from "./render-source.js";

describe("stripFrontmatter", () => {
  it("removes a leading YAML frontmatter block", () => {
    expect(stripFrontmatter("---\ntitle: x\n---\n# Hi")).toBe("# Hi");
  });
  it("leaves content without frontmatter untouched", () => {
    expect(stripFrontmatter("# Hi\n\n---\n\nrule")).toBe("# Hi\n\n---\n\nrule");
  });
});

describe("codeRanges", () => {
  it("reports fenced code block offsets", () => {
    const md = "a\n\n```ts\nconst x = 1;\n```\n\nb";
    const ranges = codeRanges(md);
    expect(ranges.length).toBe(1);
    const [start, end] = ranges[0];
    expect(md.slice(start, end)).toContain("const x = 1;");
  });
  it("reports inline code offsets", () => {
    const md = "use `code` here";
    const ranges = codeRanges(md);
    expect(md.slice(ranges[0][0], ranges[0][1])).toBe("`code`");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/include/render-source.test.ts`
Expected: FAIL — cannot resolve `./render-source.js`.

- [ ] **Step 3: Create `src/include/render-source.ts` with these two functions**

```ts
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

/** Remove a single leading YAML frontmatter block (--- … ---). */
export function stripFrontmatter(md: string): string {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

/** Character offset ranges [start, end) of fenced/indented/inline code in `md`. */
export function codeRanges(md: string): Array<[number, number]> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md);
  const ranges: Array<[number, number]> = [];
  visit(tree as never, (node: any) => {
    if (
      (node.type === "code" || node.type === "inlineCode") &&
      node.position?.start?.offset != null &&
      node.position?.end?.offset != null
    ) {
      ranges.push([node.position.start.offset, node.position.end.offset]);
    }
  });
  return ranges.sort((a, b) => a[0] - b[0]);
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/include/render-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/render-source.ts src/include/render-source.test.ts
git commit -m "feat: add frontmatter strip and code-range detection for includes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Prose transform — asset localize, link absolutize, MDX-escape

**Files:**
- Modify: `src/include/render-source.ts`
- Test: `src/include/render-source.test.ts`

`transformProse` runs only on non-code regions: it localizes image URLs, absolutizes repo-relative links, then MDX-escapes (`{`/`}` → entities; stray `<` → `&lt;`, preserving real tags). External/anchor/data URLs are left as-is.

- [ ] **Step 1: Write the failing test**

Append to `src/include/render-source.test.ts`:

```ts
import { transformProse, escapeMdx } from "./render-source.js";

const helpers = {
  localizeImage: async (u: string) => `/gitlab-assets/${u.replace(/[^a-z0-9.]/gi, "_")}`,
  absolutizeLink: (u: string) => `https://gl/g/p/-/blob/main/${u.replace(/^\.?\//, "")}`,
};

describe("escapeMdx", () => {
  it("neutralizes curly braces with entities", () => {
    expect(escapeMdx("a {x} b")).toBe("a &#123;x&#125; b");
  });
  it("escapes a stray < but keeps real tags", () => {
    expect(escapeMdx("a < b and <img> and </p> and <!-- c -->"))
      .toBe("a &lt; b and <img> and </p> and <!-- c -->");
  });
});

describe("transformProse", () => {
  it("localizes a relative markdown image", async () => {
    expect(await transformProse("![logo](./logo.png)", helpers))
      .toBe("![logo](/gitlab-assets/._logo.png)");
  });
  it("leaves an absolute image untouched", async () => {
    expect(await transformProse("![x](https://h/i.png)", helpers))
      .toBe("![x](https://h/i.png)");
  });
  it("absolutizes a repo-relative link", async () => {
    expect(await transformProse("[c](./CONTRIBUTING.md)", helpers))
      .toBe("[c](https://gl/g/p/-/blob/main/CONTRIBUTING.md)");
  });
  it("leaves anchors and external links untouched", async () => {
    expect(await transformProse("[a](#sec) [b](https://x)", helpers))
      .toBe("[a](#sec) [b](https://x)");
  });
  it("localizes an html img src", async () => {
    expect(await transformProse('<img src="./a.png">', helpers))
      .toBe('<img src="/gitlab-assets/._a.png">');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/include/render-source.test.ts`
Expected: FAIL — `transformProse`/`escapeMdx` not exported.

- [ ] **Step 3: Add to `src/include/render-source.ts`**

```ts
export interface ProseHelpers {
  localizeImage: (url: string) => Promise<string>;
  absolutizeLink: (url: string) => string;
}

const IMG_EXTERNAL = /^(https?:|data:|\/\/)/i;
const LINK_KEEP = /^(https?:|mailto:|tel:|#|\/\/)/i;

const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
const MD_LINK_RE = /(?<!!)\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
const HTML_IMG_SRC_RE = /(<img\b[^>]*?\bsrc=")([^"]*)(")/gi;

async function replaceAsync(
  input: string,
  re: RegExp,
  fn: (m: RegExpExecArray) => Promise<string>,
): Promise<string> {
  const matches = [...input.matchAll(re)];
  if (matches.length === 0) return input;
  const replacements = await Promise.all(matches.map((m) => fn(m as RegExpExecArray)));
  let out = "";
  let last = 0;
  matches.forEach((m, i) => {
    out += input.slice(last, m.index) + replacements[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + input.slice(last);
}

/** Escape MDX-significant characters in prose. Leaves real HTML tags/comments intact. */
export function escapeMdx(s: string): string {
  return s
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/<(?![A-Za-z/!])/g, "&lt;");
}

/** Rewrite images/links and MDX-escape a non-code region of markdown. */
export async function transformProse(text: string, h: ProseHelpers): Promise<string> {
  let out = await replaceAsync(text, MD_IMAGE_RE, async (m) => {
    const [, alt, url, title] = m;
    if (IMG_EXTERNAL.test(url)) return m[0];
    return `![${alt}](${await h.localizeImage(url)}${title})`;
  });
  out = await replaceAsync(out, HTML_IMG_SRC_RE, async (m) => {
    const [, pre, url, post] = m;
    if (IMG_EXTERNAL.test(url)) return m[0];
    return `${pre}${await h.localizeImage(url)}${post}`;
  });
  out = await replaceAsync(out, MD_LINK_RE, async (m) => {
    const [, label, url, title] = m;
    if (LINK_KEEP.test(url)) return m[0];
    return `[${label}](${h.absolutizeLink(url)}${title})`;
  });
  return escapeMdx(out);
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/include/render-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/render-source.ts src/include/render-source.test.ts
git commit -m "feat: add prose transform (assets, links, MDX escape) for includes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `renderSource` — combine code-aware processing + file/code mode

**Files:**
- Modify: `src/include/render-source.ts`
- Test: `src/include/render-source.test.ts`

`renderSource` strips frontmatter, walks code ranges (verbatim) vs prose (`transformProse`) for markdown; for non-markdown files it applies the line range and wraps in a fenced block. The trust boundary: code regions are never escaped/rewritten.

- [ ] **Step 1: Write the failing test**

Append to `src/include/render-source.test.ts`:

```ts
import { processMarkdownSource, renderSource } from "./render-source.js";

describe("processMarkdownSource", () => {
  it("escapes prose but leaves fenced code verbatim", async () => {
    const md = "Set {x}.\n\n```ts\nconst y = {a: 1};\n```\n";
    const out = await processMarkdownSource(md, helpers);
    expect(out).toContain("Set &#123;x&#125;.");
    expect(out).toContain("const y = {a: 1};"); // untouched inside the fence
  });
  it("leaves inline code verbatim", async () => {
    const out = await processMarkdownSource("use `{a}` now", helpers);
    expect(out).toBe("use `{a}` now");
  });
});

describe("renderSource", () => {
  const ctx = {
    assets: { localize: async (u: string) => `/gitlab-assets/${u.replace(/[^a-z0-9.]/gi, "_")}` },
    options: { host: "https://gl" },
  } as any;

  it("renders a readme as escaped markdown", async () => {
    const out = await renderSource("# T\n\nuse {x}", { ctx, project: "g/p", ref: "main", kind: "readme" });
    expect(out).toContain("# T");
    expect(out).toContain("use &#123;x&#125;");
  });

  it("wraps a code file in a fence with inferred language", async () => {
    const out = await renderSource("const a = 1;\nconst b = 2;\n", {
      ctx, project: "g/p", ref: "main", kind: "file", path: "src/a.ts",
    });
    expect(out).toBe("\n```ts\nconst a = 1;\nconst b = 2;\n\n```\n");
  });

  it("applies a line range to a code file", async () => {
    const out = await renderSource("l1\nl2\nl3\nl4", {
      ctx, project: "g/p", ref: "main", kind: "file", path: "a.ts", lineRange: "2-3",
    });
    expect(out).toBe("\n```ts\nl2\nl3\n```\n");
  });

  it("renders a markdown file as markdown (not a fence)", async () => {
    const out = await renderSource("# Doc\n\nhi {y}", {
      ctx, project: "g/p", ref: "main", kind: "file", path: "docs/x.md",
    });
    expect(out).toContain("# Doc");
    expect(out).toContain("hi &#123;y&#125;");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/include/render-source.test.ts`
Expected: FAIL — `processMarkdownSource`/`renderSource` not exported.

- [ ] **Step 3: Add to `src/include/render-source.ts`**

```ts
import { applyLineRange, languageFromPath } from "../gitlab/code.js";
import type { GitLabContext } from "../gitlab/fetchers.js";

const MD_EXT = /\.(md|mdx|markdown)$/i;

function absolutizeFactory(host: string, project: string, ref: string) {
  return (url: string) => {
    const clean = url.replace(/^\.?\//, "");
    return `${host}/${project}/-/blob/${ref}/${clean}`;
  };
}

/** Walk code ranges verbatim, transform prose between them. */
export async function processMarkdownSource(md: string, h: ProseHelpers): Promise<string> {
  const ranges = codeRanges(md);
  const out: string[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // skip nested/overlapping ranges
    out.push(await transformProse(md.slice(cursor, start), h));
    out.push(md.slice(start, end));
    cursor = end;
  }
  out.push(await transformProse(md.slice(cursor), h));
  return out.join("");
}

export interface RenderSourceOptions {
  ctx: GitLabContext;
  project: string;
  ref: string;
  kind: "readme" | "file";
  path?: string;
  lineRange?: string;
}

/** Turn fetched GitLab content into MDX-safe markdown source text. */
export async function renderSource(raw: string, o: RenderSourceOptions): Promise<string> {
  const isMarkdown = o.kind === "readme" || (o.path != null && MD_EXT.test(o.path));
  if (isMarkdown) {
    const body = stripFrontmatter(raw);
    return processMarkdownSource(body, {
      localizeImage: (u) => o.ctx.assets.localize(u, o.ref, o.project),
      absolutizeLink: absolutizeFactory(o.ctx.options.host, o.project, o.ref),
    });
  }
  const sliced = applyLineRange(raw, o.lineRange);
  const lang = languageFromPath(o.path ?? "");
  return `\n\`\`\`${lang}\n${sliced}\n\`\`\`\n`;
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/include/render-source.test.ts`
Expected: PASS.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/include/render-source.ts src/include/render-source.test.ts
git commit -m "feat: add renderSource combining code-aware markdown + code-fence modes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `transformIncludes` — find, fetch, substitute

**Files:**
- Create: `src/include/transform.ts`
- Test: `src/include/transform.test.ts`

Scans a source string for placeholders, parses each, fetches raw source, renders, and substitutes. Honors `strict` (throw vs inline warning). Dedupes identical placeholders.

- [ ] **Step 1: Write the failing test**

Create `src/include/transform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { transformIncludes } from "./transform.js";

function makeCtx() {
  const store = new Map<string, unknown>();
  return {
    client: {
      getProject: async () => ({ default_branch: "main" }),
      getFileRaw: async (_p: unknown, path: string) =>
        path === "README.md" ? "# Title\n\nbody {x}" : "const a = 1;\nconst b = 2;\n",
    },
    cache: { get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => void store.set(k, v) },
    assets: { localize: async (u: string) => `/a/${u}` },
    options: { host: "https://gl" },
  } as any;
}

const strict = { strict: true } as any;
const lax = { strict: false } as any;

describe("transformIncludes", () => {
  it("returns source unchanged when no placeholder", async () => {
    expect(await transformIncludes("# plain", makeCtx(), strict)).toBe("# plain");
  });

  it("replaces a readme placeholder with escaped markdown", async () => {
    const out = await transformIncludes("intro\n\n{@includeGitlabReadme: g/p}\n\nend", makeCtx(), strict);
    expect(out).toContain("# Title");
    expect(out).toContain("body &#123;x&#125;");
    expect(out).not.toContain("{@includeGitlabReadme");
  });

  it("replaces a file placeholder with a fenced block", async () => {
    const out = await transformIncludes("{@includeGitlabFile: g/p/-/src/a.ts#L1-1}", makeCtx(), strict);
    expect(out).toContain("```ts");
    expect(out).toContain("const a = 1;");
    expect(out).not.toContain("const b = 2;"); // line range applied
  });

  it("throws in strict mode on a malformed placeholder", async () => {
    await expect(transformIncludes("{@includeGitlabFile: g/p}", makeCtx(), strict)).rejects.toThrow();
  });

  it("emits an inline warning in lax mode on a malformed placeholder", async () => {
    const out = await transformIncludes("{@includeGitlabFile: g/p}", makeCtx(), lax);
    expect(out).toContain("> ⚠️");
    expect(out).toContain("failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/include/transform.test.ts`
Expected: FAIL — cannot resolve `./transform.js`.

- [ ] **Step 3: Create `src/include/transform.ts`**

```ts
import type { GitLabContext } from "../gitlab/fetchers.js";
import { fetchFileSource, fetchReadmeSource } from "../gitlab/fetchers.js";
import type { ResolvedOptions } from "../options.js";
import { parseInclude } from "./grammar.js";
import { renderSource } from "./render-source.js";

const PLACEHOLDER_RE = /\{@(includeGitlabReadme|includeGitlabFile):\s*([^}]+)\}/g;

export async function transformIncludes(
  source: string,
  ctx: GitLabContext,
  options: Pick<ResolvedOptions, "strict">,
): Promise<string> {
  const seen = new Map<string, { kind: "readme" | "file"; arg: string }>();
  for (const m of source.matchAll(PLACEHOLDER_RE)) {
    seen.set(m[0], {
      kind: m[1] === "includeGitlabReadme" ? "readme" : "file",
      arg: m[2],
    });
  }
  if (seen.size === 0) return source;

  const entries = await Promise.all(
    [...seen.entries()].map(async ([full, { kind, arg }]) => {
      try {
        const spec = parseInclude(kind, arg);
        const { raw, ref } =
          kind === "readme"
            ? await fetchReadmeSource(ctx, { project: spec.project, ref: spec.ref })
            : await fetchFileSource(ctx, { project: spec.project, path: spec.path!, ref: spec.ref });
        const body = await renderSource(raw, {
          ctx,
          project: spec.project,
          ref,
          kind,
          path: spec.path,
          lineRange: spec.lineRange,
        });
        return [full, `\n\n${body}\n\n`] as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (options.strict) {
          throw new Error(`@ebuildy/docusaurus-plugin-gitlab: ${full} failed — ${message}`);
        }
        return [full, `\n\n> ⚠️ ${full} failed — ${message}\n\n`] as const;
      }
    }),
  );

  let out = source;
  for (const [full, text] of entries) out = out.split(full).join(text);
  return out;
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx vitest run src/include/transform.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/include/transform.ts src/include/transform.test.ts
git commit -m "feat: add transformIncludes orchestration for placeholders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Context singleton + webpack loader

**Files:**
- Create: `src/include/context.ts`
- Create: `src/include/loader.ts`
- Test: `src/include/loader.test.ts`

The loader is a thin webpack adapter: it reads resolved options from `this.getOptions()`, short-circuits files with no placeholder, and delegates to `transformIncludes` via `this.async()`. The context is built once per resolved-options key.

- [ ] **Step 1: Write the failing test**

Create `src/include/loader.test.ts`. It invokes the loader with a hand-rolled webpack loader `this` context and a stub GitLab server is unnecessary because we point at a fake by overriding via the options' host is irrelevant — instead we test the short-circuit and the async wiring against a real (lax) path that fails fast offline:

```ts
import { describe, it, expect } from "vitest";
import loader from "./loader.js";

function run(source: string, resolved: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = {
      async: () => (err: Error | null, out?: string) => (err ? reject(err) : resolve(out!)),
      getOptions: () => ({ resolved }),
      resourcePath: "/docs/x.mdx",
    };
    loader.call(ctx, source);
  });
}

describe("gitlab include loader", () => {
  it("passes through files with no placeholder untouched", async () => {
    const out = await run("# nothing here", { strict: true, host: "https://gl", cache: false });
    expect(out).toBe("# nothing here");
  });

  it("does not throw synchronously for placeholder files (delegates to async)", async () => {
    // lax mode: an offline fetch fails but is caught and rendered as an inline warning.
    const out = await run("{@includeGitlabReadme: g/p}", {
      strict: false,
      host: "http://127.0.0.1:1",
      token: undefined,
      cache: false,
      assetDir: "static/gitlab-assets",
      assetBaseUrl: "/gitlab-assets",
    });
    expect(out).toContain("> ⚠️");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/include/loader.test.ts`
Expected: FAIL — cannot resolve `./loader.js`.

- [ ] **Step 3: Create `src/include/context.ts`**

```ts
import { buildContext } from "../gitlab/context.js";
import type { GitLabContext } from "../gitlab/fetchers.js";
import type { ResolvedOptions } from "../options.js";

const contexts = new Map<string, GitLabContext>();

/** One context per distinct resolved-options set, reused across loader calls. */
export function getContext(resolved: ResolvedOptions): GitLabContext {
  const key = JSON.stringify(resolved);
  let ctx = contexts.get(key);
  if (!ctx) {
    ctx = buildContext(resolved);
    contexts.set(key, ctx);
  }
  return ctx;
}
```

- [ ] **Step 4: Create `src/include/loader.ts`**

```ts
import type { ResolvedOptions } from "../options.js";
import { getContext } from "./context.js";
import { transformIncludes } from "./transform.js";

interface LoaderThis {
  async: () => (err: Error | null, content?: string) => void;
  getOptions: () => { resolved: ResolvedOptions };
}

export default function gitlabIncludeLoader(this: LoaderThis, source: string): void {
  const callback = this.async();
  const { resolved } = this.getOptions();

  if (!source.includes("{@includeGitlab")) {
    callback(null, source);
    return;
  }

  transformIncludes(source, getContext(resolved), resolved).then(
    (out) => callback(null, out),
    (err) => callback(err instanceof Error ? err : new Error(String(err))),
  );
}
```

- [ ] **Step 5: Run tests to verify green**

Run: `npx vitest run src/include/loader.test.ts`
Expected: PASS (the second test makes a real connection attempt to a dead port and renders the caught failure as an inline warning).

- [ ] **Step 6: Commit**

```bash
git add src/include/context.ts src/include/loader.ts src/include/loader.test.ts
git commit -m "feat: add include context singleton and webpack loader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Docusaurus plugin

**Files:**
- Create: `src/plugin/index.ts`
- Modify: `src/index.ts`
- Test: `src/plugin/index.test.ts`

The plugin resolves options once, registers our loader as an `enforce: "pre"` rule on `.md(x)` (so it transforms raw source *before* the Docusaurus MDX loader), and contributes `theme.css` via `getClientModules`.

> **Integration note (from spec):** Docusaurus has no first-class API for one plugin to inject a *remark* plugin into content-docs. This plugin therefore auto-wires the **loader (placeholders)** and **theme.css**; the `remarkGitlab` remark plugin (for the JSX components) remains a documented one-line addition to the preset's `remarkPlugins`. Do not attempt to mutate other plugins' MDX config.

- [ ] **Step 1: Write the failing test**

Create `src/plugin/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import gitlabPlugin from "./index.js";

const ctx = {} as any;
const opts = { host: "https://gitlab.example.com", cache: false } as any;

describe("gitlabPlugin", () => {
  it("has the package name", () => {
    expect(gitlabPlugin(ctx, opts).name).toBe("@ebuildy/docusaurus-plugin-gitlab");
  });

  it("registers a pre-loader rule for markdown files", () => {
    const wp = gitlabPlugin(ctx, opts).configureWebpack!({} as any, false, {} as any);
    const rule = (wp.module!.rules as any[])[0];
    expect(rule.enforce).toBe("pre");
    expect(String(rule.test)).toContain("mdx?");
    expect(rule.use[0].loader).toContain("include");
    expect(rule.use[0].loader).toContain("loader.js");
    expect(rule.use[0].options.resolved.host).toBe("https://gitlab.example.com");
  });

  it("contributes the theme stylesheet", () => {
    const mods = gitlabPlugin(ctx, opts).getClientModules!();
    expect(mods[0]).toContain("theme.css");
  });

  it("validates options eagerly", () => {
    expect(() => gitlabPlugin(ctx, { host: "not-a-url" } as any)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/plugin/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Create `src/plugin/index.ts`**

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOptions, type PluginOptions } from "../options.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default function gitlabPlugin(_context: unknown, options: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const resolved = resolveOptions(options, mode);

  return {
    name: "@ebuildy/docusaurus-plugin-gitlab",

    getClientModules() {
      // dist/plugin/index.js -> package root theme.css
      return [path.resolve(dirname, "../../theme.css")];
    },

    configureWebpack() {
      return {
        module: {
          rules: [
            {
              test: /\.mdx?$/,
              enforce: "pre" as const,
              use: [
                {
                  loader: path.resolve(dirname, "../include/loader.js"),
                  options: { resolved },
                },
              ],
            },
          ],
        },
      };
    },
  };
}
```

- [ ] **Step 4: Wire the default export in `src/index.ts`**

Add as the first line:

```ts
export { default } from "./plugin/index.js";
```

(Keep all existing named exports.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/plugin/index.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/plugin/index.ts src/plugin/index.test.ts src/index.ts
git commit -m "feat: add Docusaurus plugin wiring the include loader and theme css

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Package exports + packaging guard

**Files:**
- Modify: `package.json`
- Modify: `test/packaging.test.ts`

- [ ] **Step 1: Add the `./plugin` export to `package.json`**

In the `"exports"` object, after the `"."` block and before `"./remark"`, add:

```json
    "./plugin": {
      "types": "./dist/plugin/index.d.ts",
      "import": "./dist/plugin/index.js",
      "default": "./dist/plugin/index.js"
    },
```

- [ ] **Step 2: Write the failing test**

Append to `test/packaging.test.ts` a check that the package's default export is the plugin function. Match the file's existing style for locating `dist`; add:

```ts
import { describe, it, expect } from "vitest";

describe("packaging: plugin default export", () => {
  it("exposes a Docusaurus plugin as the package default export", async () => {
    const mod = await import("../dist/index.js");
    expect(typeof mod.default).toBe("function");
    const plugin = mod.default({}, { host: "https://gitlab.example.com", cache: false });
    expect(plugin.name).toBe("@ebuildy/docusaurus-plugin-gitlab");
  });
});
```

- [ ] **Step 3: Build, then run the packaging test**

Run: `npm run build && npx vitest run test/packaging.test.ts`
Expected: PASS. (Packaging tests import from `dist/`, so the build must run first.)

- [ ] **Step 4: Commit**

```bash
git add package.json test/packaging.test.ts
git commit -m "build: export ./plugin and guard the plugin default export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Example site wiring + e2e coverage

**Files:**
- Modify: `examples/site/docusaurus.config.ts`
- Modify: `examples/site/package.json` (add `remark-gemoji` dep)
- Create: `examples/site/docs/includes.mdx`
- Modify: `test/e2e/fixtures.ts`
- Modify: `test/e2e/build.test.ts`

This proves the native pipeline end-to-end: an included README's `## Install` becomes a real Docusaurus heading (anchor id), and `:rocket:` renders as an emoji — neither of which the JSX-component path produces.

- [ ] **Step 1: Extend the stub README in `test/e2e/fixtures.ts`**

Change the README handler body (the `/repository/files/README.md/raw` branch) to include an emoji and keep the existing headings/image:

```ts
    if (url.includes("/repository/files/README.md/raw")) {
      return send(
        "# Hello :rocket:\n\nReadme body.\n\n## Install\n\nsetup\n\n## Usage\n\ngo\n\n![logo](./logo.png)",
        "text/plain",
      );
    }
```

- [ ] **Step 2: Register the plugin + gemoji in `examples/site/docusaurus.config.ts`**

Add `remark-gemoji` import and a top-level `plugins` array; keep the existing `remarkPlugins: [[remarkGitlab, …]]` for the JSX components. The file becomes:

```ts
import type { Config } from "@docusaurus/types";
import gitlabPlugin, { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";
import remarkGemoji from "remark-gemoji";

const gitlabOptions = {
  host: process.env.GITLAB_HOST ?? "https://gitlab.com",
  token: process.env.GITLAB_TOKEN,
  strict: true,
};

const config: Config = {
  title: "GitLab MDX Example",
  url: "https://example.com",
  baseUrl: "/",
  favicon: undefined,
  onBrokenLinks: "ignore",
  onBrokenMarkdownLinks: "ignore",
  plugins: [[gitlabPlugin, gitlabOptions]],
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [remarkGemoji, [remarkGitlab, gitlabOptions]],
        },
        blog: false,
        theme: {},
      },
    ],
  ],
};

export default config;
```

- [ ] **Step 3: Add `remark-gemoji` to `examples/site/package.json`**

Add `"remark-gemoji": "^8.0.0"` under `dependencies`, then install:

Run: `cd examples/site && npm install && cd ../..`
Expected: lockfile updated, no errors.

- [ ] **Step 4: Create `examples/site/docs/includes.mdx`**

```mdx
---
title: Includes
---

# Includes

{@includeGitlabReadme: group/repo}
```

- [ ] **Step 5: Add e2e assertions in `test/e2e/build.test.ts`**

Add a test inside the existing `describe("e2e: docusaurus build", …)` block:

```ts
  it("flows included README through the native Docusaurus pipeline", () => {
    const html = readFileSync(join(siteDir, "build", "includes", "index.html"), "utf8");
    // Native heading anchors (the JSX component path does not produce these):
    expect(html).toMatch(/<h2[^>]*\bid="install"/);
    expect(html).toMatch(/<h2[^>]*\bid="usage"/);
    // Native emoji from remark-gemoji:
    expect(html).toContain("🚀");
  });
```

- [ ] **Step 6: Build the package, then run the e2e**

Run: `npm run build && npx vitest run test/e2e/build.test.ts`
Expected: PASS. The e2e builds `examples/site` against the in-process stub (~1 min). If the route path differs, inspect `examples/site/build/` for the generated `includes/index.html` and adjust the path.

- [ ] **Step 7: Commit**

```bash
git add examples/site/docusaurus.config.ts examples/site/package.json examples/site/package-lock.json examples/site/docs/includes.mdx test/e2e/fixtures.ts test/e2e/build.test.ts
git commit -m "test: e2e coverage for include placeholders via native pipeline

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Documentation

**Files:**
- Modify: `README.md`
- Create: `examples/gitlab/docs/includes.mdx`

- [ ] **Step 1: Add a README section**

Add a `## Include placeholders` section to `README.md` documenting:
- Setup: add the plugin once — `plugins: [['@ebuildy/docusaurus-plugin-gitlab', { host, token }]]` — and (for the JSX components) keep `remarkGitlab` in `presets…docs.remarkPlugins`.
- Syntax table:

```markdown
| Placeholder | Effect |
|---|---|
| `{@includeGitlabReadme: group/sub/project}` | Inline the project README (default branch) |
| `{@includeGitlabReadme: ref@group/sub/project}` | …at a branch/tag/sha |
| `{@includeGitlabFile: group/sub/project/-/path/file.md}` | Inline a markdown file as markdown |
| `{@includeGitlabFile: ref@group/sub/project/-/src/app.ts#L10-25}` | Inline a code file as a highlighted block (optional line range) |
```

- Notes: project and path are separated by `/-/` (GitLab-style); `.md`/`.mdx`/`.markdown` files render as markdown, everything else as a fenced code block; images are localized and repo-relative links absolutized; content flows through Docusaurus's own pipeline (TOC, emoji, admonitions, Prism).

- [ ] **Step 2: Create `examples/gitlab/docs/includes.mdx`**

A live example page mirroring the other `examples/gitlab/docs/*` pages, using `{@includeGitlabReadme: …}` against a public project (match whichever public project the sibling pages use). Include a short intro paragraph and one readme + one file placeholder.

- [ ] **Step 3: Commit**

```bash
git add README.md examples/gitlab/docs/includes.mdx
git commit -m "docs: document GitLab include placeholders

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full unit suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Build**

Run: `npm run build`
Expected: clean `dist/` with `dist/plugin/index.js` and `dist/include/loader.js`.

- [ ] **E2E (slow)**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: all green, including the new native-pipeline assertions.
