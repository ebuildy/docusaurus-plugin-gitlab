# Relative Link Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite relative links in fetched GitLab markdown into absolute GitLab URLs at build time, so Docusaurus stops failing the build with "Docusaurus found broken links!", with a `relativeLinks` flag to point them at the docs site instead.

**Architecture:** A new pure module `src/gitlab/links.ts` exports `resolveRepoLink(href, ctx)`. It normalizes any relative href to a repo-root path, then applies a mode-specific prefix (`gitlab` → `{publicUrl}/{project}/-/blob/{ref}/…`, `site` → `{linkBase}/…` with `.md` stripped, `keep` → untouched). The four `renderMarkdown` call sites in `src/gitlab/fetchers.ts` pass it through the **already-existing but unused** `transformLinkHref` hook in `src/gitlab/markdown.ts`. Three new plugin options (`publicUrl`, `relativeLinks`, `linkBase`) flow through `resolveOptions` → `buildContext` → `ctx.options`, each overridable per component via an attribute.

**Tech Stack:** TypeScript (ESM, `moduleResolution: "Bundler"` — intra-package imports need explicit `.js` extensions), Vitest, Joi (option validation), unified/rehype (rendering), Docusaurus 3.

**Spec:** `docs/superpowers/specs/2026-08-25-relative-links-design.md`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/gitlab/links.ts` | **create** | `resolveRepoLink` + `LinkMode` — pure, no I/O, no imports from the rest of the package |
| `src/gitlab/links.test.ts` | **create** | Table-driven unit tests for the resolver |
| `src/options.ts` | modify | `publicUrl`, `relativeLinks`, `linkBase`: types, Joi schema, defaults |
| `src/gitlab/context.ts` | modify | Forward the three options into `ctx.options` |
| `src/gitlab/fetchers.ts` | modify | `GitLabContext` option types, `readLinkOpts` / `linkHook` helpers, four call sites, four memo keys |
| `test/e2e/fixtures.ts` | modify | Add a relative link to the stub README |
| `test/e2e/build.test.ts` | modify | Assert the built HTML contains the absolute blob URL |
| `examples/gitlab/docusaurus.config.ts` | modify | `onBrokenLinks: "throw"` — the build-level guard |
| `examples/site/docs/components/readme.mdx` | modify | Document the behaviour on the example page |
| `README.md` | modify | Plugin option rows, component prop rows, a "Link resolution" section |

`src/gitlab/links.ts` deliberately imports nothing from the package: it is a string
transform, which is why it can be tested exhaustively without a single mock.

---

## Task 1: The resolver — pass-through cases and `gitlab` mode

**Files:**
- Create: `src/gitlab/links.ts`
- Test: `src/gitlab/links.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/gitlab/links.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveRepoLink, type RepoLinkContext } from "./links";

const gitlab: RepoLinkContext = {
  mode: "gitlab",
  publicUrl: "https://gitlab.com",
  project: "group/proj",
  ref: "main",
  basePath: "README.md",
};

describe("resolveRepoLink — pass-through", () => {
  it.each([
    ["", "empty"],
    ["   ", "whitespace only"],
    ["#usage", "in-page anchor"],
    ["?tab=readme", "query only"],
    ["https://example.com/x", "absolute https"],
    ["http://example.com/x", "absolute http"],
    ["mailto:a@b.com", "mailto"],
    ["tel:+33123", "tel"],
    ["data:text/plain,hi", "data URI"],
    ["//cdn.example.com/x.png", "protocol-relative"],
  ])("leaves %j untouched (%s)", (href) => {
    expect(resolveRepoLink(href, gitlab)).toBe(href);
  });
});

describe("resolveRepoLink — gitlab mode", () => {
  it.each([
    ["README.md", "CONTRIBUTING.md", "https://gitlab.com/group/proj/-/blob/main/CONTRIBUTING.md"],
    ["README.md", "./docs/x.md", "https://gitlab.com/group/proj/-/blob/main/docs/x.md"],
    ["README.md", "/docs/x.md", "https://gitlab.com/group/proj/-/blob/main/docs/x.md"],
    ["docs/a.md", "b.md", "https://gitlab.com/group/proj/-/blob/main/docs/b.md"],
    ["docs/a.md", "../b.md", "https://gitlab.com/group/proj/-/blob/main/b.md"],
    ["docs/deep/a.md", "../../top.md", "https://gitlab.com/group/proj/-/blob/main/top.md"],
    ["docs/a.md", "../../../etc", "https://gitlab.com/group/proj/-/blob/main/etc"],
  ])("resolves %j + %j", (basePath, href, expected) => {
    expect(resolveRepoLink(href, { ...gitlab, basePath })).toBe(expected);
  });

  it("preserves a hash", () => {
    expect(resolveRepoLink("./docs/x.md#install", gitlab)).toBe(
      "https://gitlab.com/group/proj/-/blob/main/docs/x.md#install",
    );
  });

  it("preserves a query and a hash together", () => {
    expect(resolveRepoLink("docs/x.md?plain=1#L4", gitlab)).toBe(
      "https://gitlab.com/group/proj/-/blob/main/docs/x.md?plain=1#L4",
    );
  });

  it("tolerates a trailing slash on publicUrl", () => {
    expect(resolveRepoLink("x.md", { ...gitlab, publicUrl: "https://gl.example.com/" })).toBe(
      "https://gl.example.com/group/proj/-/blob/main/x.md",
    );
  });

  it("treats an absent basePath as the repository root", () => {
    expect(resolveRepoLink("docs/x.md", { ...gitlab, basePath: undefined })).toBe(
      "https://gitlab.com/group/proj/-/blob/main/docs/x.md",
    );
  });

  it("uses the ref it is given, not a default branch", () => {
    expect(resolveRepoLink("CHANGELOG.md", { ...gitlab, ref: "v1.2.0" })).toBe(
      "https://gitlab.com/group/proj/-/blob/v1.2.0/CHANGELOG.md",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/gitlab/links.test.ts`

Expected: FAIL — `Failed to resolve import "./links"`.

- [ ] **Step 3: Write the implementation**

Create `src/gitlab/links.ts`:

```ts
/** Where a relative link in fetched GitLab markdown should point. */
export type LinkMode = "gitlab" | "keep" | "site";

export interface RepoLinkContext {
  /** Where a relative link should point. */
  mode: LinkMode;
  /** Public GitLab base URL, e.g. "https://gitlab.com". Used by "gitlab" mode. */
  publicUrl: string;
  /** Project path with namespace, e.g. "group/project". */
  project: string;
  /** Branch, tag, or SHA the markdown was read at. */
  ref: string;
  /** Repo-relative path of the file being rendered, e.g. "docs/guide.md".
   *  Relative links resolve against its directory. Absent ⇒ repository root. */
  basePath?: string;
  /** Site path the mirrored docs tree is mounted at. Used by "site" mode. */
  linkBase?: string;
}

// A URI scheme: "https:", "mailto:", "tel:", "data:", …
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Splits "docs/x.md?plain=1#L4" into ["docs/x.md", "?plain=1#L4"]. */
function splitSuffix(href: string): [path: string, suffix: string] {
  const i = href.search(/[?#]/);
  return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i)];
}

/**
 * Normalizes a relative href to a clean repo-root-relative path. A leading "/"
 * means the repository root (matching how `AssetManager.absolute` treats image
 * paths); otherwise the path resolves against `basePath`'s directory. ".."
 * segments that would escape the root are clamped at it.
 */
function normalizePath(path: string, basePath: string | undefined): string {
  const segments = path.startsWith("/")
    ? []
    : (basePath ?? "").split("/").slice(0, -1).filter(Boolean);
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/**
 * Rewrites a relative link found in fetched GitLab markdown. Absolute URLs,
 * anchors, and non-http schemes are returned untouched, as is everything in
 * "keep" mode.
 */
export function resolveRepoLink(href: string, ctx: RepoLinkContext): string {
  if (ctx.mode === "keep") return href;
  if (!href.trim()) return href;
  if (href.startsWith("#")) return href;
  if (href.startsWith("//")) return href;
  if (SCHEME_RE.test(href)) return href;

  const [rawPath, suffix] = splitSuffix(href);
  // A query- or hash-only href ("?tab=x") targets the current document.
  if (!rawPath) return href;

  const path = normalizePath(rawPath, ctx.basePath);
  const publicUrl = ctx.publicUrl.replace(/\/+$/, "");
  return `${publicUrl}/${ctx.project}/-/blob/${ctx.ref}/${path}${suffix}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/gitlab/links.test.ts`

Expected: PASS — 20 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm run typecheck`

Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/gitlab/links.ts src/gitlab/links.test.ts
git commit -S -m "feat(links): add resolveRepoLink for relative links in GitLab markdown"
```

---

## Task 2: `site` and `keep` modes

**Files:**
- Modify: `src/gitlab/links.ts`
- Test: `src/gitlab/links.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/gitlab/links.test.ts`:

```ts
const site: RepoLinkContext = {
  mode: "site",
  publicUrl: "https://gitlab.com",
  project: "group/proj",
  ref: "main",
  basePath: "README.md",
  linkBase: "/repo",
};

describe("resolveRepoLink — site mode", () => {
  it.each([
    ["README.md", "CONTRIBUTING.md", "/repo/CONTRIBUTING"],
    ["README.md", "./docs/x.md", "/repo/docs/x"],
    ["README.md", "./docs/x.mdx", "/repo/docs/x"],
    ["README.md", "/docs/x.md", "/repo/docs/x"],
    ["docs/a.md", "../b.md", "/repo/b"],
    ["docs/a.md", "assets/logo.png", "/repo/docs/assets/logo.png"],
  ])("resolves %j + %j", (basePath, href, expected) => {
    expect(resolveRepoLink(href, { ...site, basePath })).toBe(expected);
  });

  it("preserves a hash after stripping the extension", () => {
    expect(resolveRepoLink("./docs/x.md#install", site)).toBe("/repo/docs/x#install");
  });

  it("emits a root-absolute path when linkBase is empty", () => {
    expect(resolveRepoLink("./docs/x.md", { ...site, linkBase: "" })).toBe("/docs/x");
  });

  it("emits a root-absolute path when linkBase is absent", () => {
    expect(resolveRepoLink("./docs/x.md", { ...site, linkBase: undefined })).toBe("/docs/x");
  });

  it("tolerates a trailing slash on linkBase", () => {
    expect(resolveRepoLink("x.md", { ...site, linkBase: "/repo/" })).toBe("/repo/x");
  });

  it("strips the extension case-insensitively", () => {
    expect(resolveRepoLink("READ.MD", site)).toBe("/repo/READ");
  });

  it("leaves anchors and absolute URLs untouched", () => {
    expect(resolveRepoLink("#usage", site)).toBe("#usage");
    expect(resolveRepoLink("https://example.com/x.md", site)).toBe("https://example.com/x.md");
  });
});

describe("resolveRepoLink — keep mode", () => {
  it.each(["./docs/x.md", "/docs/x.md", "../b.md", "#usage", "https://example.com"])(
    "returns %j unchanged",
    (href) => {
      expect(resolveRepoLink(href, { ...gitlab, mode: "keep" })).toBe(href);
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/gitlab/links.test.ts`

Expected: FAIL — site-mode cases return blob URLs, e.g.
`expected 'https://gitlab.com/group/proj/-/blob/main/CONTRIBUTING.md' to be '/repo/CONTRIBUTING'`.
The `keep` cases already pass (that guard is in place from Task 1).

- [ ] **Step 3: Write the implementation**

In `src/gitlab/links.ts`, add the extension pattern next to `SCHEME_RE`:

```ts
// Markdown extensions stripped by "site" mode — Docusaurus routes carry none.
const MARKDOWN_EXT_RE = /\.mdx?$/i;
```

Then replace the final two lines of `resolveRepoLink` (the `publicUrl` const and
the `return`) with:

```ts
  const path = normalizePath(rawPath, ctx.basePath);

  if (ctx.mode === "site") {
    const linkBase = (ctx.linkBase ?? "").replace(/\/+$/, "");
    return `${linkBase}/${path.replace(MARKDOWN_EXT_RE, "")}${suffix}`;
  }

  const publicUrl = ctx.publicUrl.replace(/\/+$/, "");
  return `${publicUrl}/${ctx.project}/-/blob/${ctx.ref}/${path}${suffix}`;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/gitlab/links.test.ts`

Expected: PASS — 36 tests.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/links.ts src/gitlab/links.test.ts
git commit -S -m "feat(links): add site and keep modes to resolveRepoLink"
```

---

## Task 3: Plugin options `publicUrl`, `relativeLinks`, `linkBase`

**Files:**
- Modify: `src/options.ts`
- Modify: `src/gitlab/context.ts:32-58` (`buildContext`)
- Test: `src/options.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe("resolveOptions", …)` block in `src/options.test.ts`:

```ts
  it("defaults publicUrl to host", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "production");
    expect(o.publicUrl).toBe("https://gitlab.com");
  });

  it("uses an explicit publicUrl over host", () => {
    const o = resolveOptions(
      { host: "http://gitlab.internal:8080", publicUrl: "https://gitlab.example.com" },
      "production",
    );
    expect(o.host).toBe("http://gitlab.internal:8080");
    expect(o.publicUrl).toBe("https://gitlab.example.com");
  });

  it("strips a trailing slash from publicUrl", () => {
    const o = resolveOptions({ host: "https://gitlab.com", publicUrl: "https://x.example.com/" }, "production");
    expect(o.publicUrl).toBe("https://x.example.com");
  });

  it("rejects a publicUrl that is not a URI", () => {
    expect(() => resolveOptions({ host: "https://gitlab.com", publicUrl: "not a url" }, "production")).toThrow(
      /publicUrl/,
    );
  });

  it("defaults relativeLinks to gitlab and linkBase to an empty string", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "production");
    expect(o.relativeLinks).toBe("gitlab");
    expect(o.linkBase).toBe("");
  });

  it("passes through relativeLinks and linkBase", () => {
    const o = resolveOptions(
      { host: "https://gitlab.com", relativeLinks: "site", linkBase: "/repo/" },
      "production",
    );
    expect(o.relativeLinks).toBe("site");
    expect(o.linkBase).toBe("/repo");
  });

  it("rejects an unknown relativeLinks value", () => {
    expect(() =>
      resolveOptions({ host: "https://gitlab.com", relativeLinks: "internal" as any }, "production"),
    ).toThrow(/relativeLinks/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/options.test.ts`

Expected: FAIL — `expected undefined to be 'https://gitlab.com'`, and the Joi
schema rejects `publicUrl` as an unknown option.

- [ ] **Step 3: Write the implementation**

In `src/options.ts`, add to the `PluginOptions` interface, right after `assetBaseUrl`:

```ts
  /** Public GitLab base URL used to build links to repository files. Defaults to
   *  `host`. Set it when the build-time API host differs from the user-facing
   *  URL (e.g. an internal hostname behind a reverse proxy). */
  publicUrl?: string;
  /** Where relative links in fetched markdown should point: `"gitlab"` (absolute
   *  blob URLs), `"site"` (site-internal paths, `.md` stripped, prefixed with
   *  `linkBase`), or `"keep"` (untouched). Default: `"gitlab"`. Overridable per
   *  component with the `relativeLinks` attribute. */
  relativeLinks?: LinkMode;
  /** Site path the mirrored docs tree is mounted at, used by
   *  `relativeLinks: "site"`. Default: `""` (site root). Overridable per
   *  component with the `linkBase` attribute. */
  linkBase?: string;
```

Add to `ResolvedOptions`, after `assetBaseUrl`:

```ts
  publicUrl: string;
  relativeLinks: LinkMode;
  linkBase: string;
```

Import the type at the top of the file (note the `.js` extension — required by the
ESM/Bundler setup):

```ts
import type { LinkMode } from "./gitlab/links.js";
```

Add to the Joi `schema` object, after `assetBaseUrl`:

```ts
  publicUrl: Joi.string().uri().optional(),
  relativeLinks: Joi.string().valid("gitlab", "keep", "site").optional(),
  linkBase: Joi.string().allow("").optional(),
```

Add to the object returned by `resolveOptions`, after `assetBaseUrl`:

```ts
    publicUrl: (opts.publicUrl ?? opts.host).replace(/\/+$/, ""),
    relativeLinks: opts.relativeLinks ?? "gitlab",
    linkBase: (opts.linkBase ?? "").replace(/\/+$/, ""),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/options.test.ts`

Expected: PASS.

- [ ] **Step 5: Forward the options into the fetcher context**

In `src/gitlab/context.ts`, inside `buildContext`, extend the returned
`options` object (currently `host`, `strict`, `allowedHosts`, `debug`,
`markdownRenderChain`) with three entries:

```ts
    options: {
      host: options.host,
      publicUrl: options.publicUrl,
      relativeLinks: options.relativeLinks,
      linkBase: options.linkBase,
      strict: options.strict,
      allowedHosts: options.includeAllowedHosts,
      debug: options.debug,
      markdownRenderChain: options.markdownRenderChain,
    },
```

In `src/gitlab/fetchers.ts`, extend the `options` member of the `GitLabContext`
interface (around line 34). Keep the new fields **optional** — the existing test
fakes build `ctx.options` by hand and must keep compiling:

```ts
  options: {
    host: string;
    /** Public GitLab base URL for generated links. Defaults to `host`. */
    publicUrl?: string;
    /** Site-wide default for the `relativeLinks` attribute. Default: "gitlab". */
    relativeLinks?: LinkMode;
    /** Site-wide default for the `linkBase` attribute. Default: "". */
    linkBase?: string;
    /** Include-pipeline settings (populated by `buildContext`); optional so test
     *  fakes can omit them. Defaults applied where read. */
    strict?: boolean;
    allowedHosts?: string[];
    debug?: boolean;
    markdownRenderChain?: PluggableList;
  };
```

Add the import to `src/gitlab/fetchers.ts` (alongside the other `./` imports):

```ts
import { resolveRepoLink, type LinkMode } from "./links.js";
```

`resolveRepoLink` is unused until Task 4 — if the linter flags it, complete Task 4
before running lint, or import only the type here and add the value import in
Task 4.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `pnpm exec vitest run && pnpm run typecheck`

Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/options.ts src/options.test.ts src/gitlab/context.ts src/gitlab/fetchers.ts
git commit -S -m "feat(options): add publicUrl, relativeLinks, and linkBase"
```

---

## Task 4: Wire `fetchReadme` + the shared attribute helpers

**Files:**
- Modify: `src/gitlab/fetchers.ts` (helpers near `readTocMode` ~line 244; `fetchReadme` ~line 252)
- Test: `src/gitlab/fetchers.test.ts` (in `describe("fetchReadme", …)`, ~line 291)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("fetchReadme", …)` block:

```ts
  it("rewrites relative links to absolute GitLab blob URLs", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[contrib](./CONTRIBUTING.md) [top](#usage) [ext](https://x.dev)"),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r" });
    expect(data.html).toContain('href="https://gitlab.com/g/r/-/blob/main/CONTRIBUTING.md"');
    expect(data.html).toContain('href="#usage"');
    expect(data.html).toContain('href="https://x.dev"');
  });

  it("honors publicUrl over host when building links", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[x](./x.md)"),
    };
    const c = ctx(client);
    c.options.publicUrl = "https://public.example.com";
    const data = await fetchReadme(c, { project: "g/r" });
    expect(data.html).toContain('href="https://public.example.com/g/r/-/blob/main/x.md"');
  });

  it("uses the relativeLinks attribute over the plugin option", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[x](./docs/x.md)"),
    };
    const c = ctx(client);
    c.options.relativeLinks = "gitlab";
    const data = await fetchReadme(c, { project: "g/r", relativeLinks: "site", linkBase: "/repo" });
    expect(data.html).toContain('href="/repo/docs/x"');
  });

  it("falls back to the plugin option when the attribute is absent", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[x](./docs/x.md)"),
    };
    const c = ctx(client);
    c.options.relativeLinks = "site";
    c.options.linkBase = "/mirror";
    const data = await fetchReadme(c, { project: "g/r" });
    expect(data.html).toContain('href="/mirror/docs/x"');
  });

  it("leaves links untouched in keep mode", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[x](./docs/x.md)"),
    };
    const data = await fetchReadme(ctx(client), { project: "g/r", relativeLinks: "keep" });
    expect(data.html).toContain('href="./docs/x.md"');
  });

  it("throws on an unknown relativeLinks value", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "body"),
    };
    await expect(fetchReadme(ctx(client), { project: "g/r", relativeLinks: "internal" })).rejects.toThrow(
      /relativeLinks/,
    );
  });

  it("keys the cache on relativeLinks so two modes do not collide", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[x](./docs/x.md)"),
    };
    const c = ctx(client);
    const first = await fetchReadme(c, { project: "g/r" });
    const second = await fetchReadme(c, { project: "g/r", relativeLinks: "site", linkBase: "/repo" });
    expect(first.html).toContain('href="https://gitlab.com/g/r/-/blob/main/docs/x.md"');
    expect(second.html).toContain('href="/repo/docs/x"');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts -t "fetchReadme"`

Expected: FAIL — the first case reports `href="./CONTRIBUTING.md"` instead of the
blob URL; the "unknown relativeLinks value" case fails because nothing throws.

- [ ] **Step 3: Write the helpers**

In `src/gitlab/fetchers.ts`, add directly below `readTocMode`:

```ts
interface LinkOpts {
  mode: LinkMode;
  linkBase: string;
}

/**
 * Resolves the link-rewriting settings for one component render: attribute
 * first, then the plugin option, then the default. Throws on an unknown mode so
 * a typo fails the build instead of silently keeping relative links.
 */
function readLinkOpts(ctx: GitLabContext, attrs: Attrs, component: string): LinkOpts {
  const mode = attrs.relativeLinks ?? ctx.options.relativeLinks ?? "gitlab";
  if (mode !== "gitlab" && mode !== "keep" && mode !== "site") {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: <${component}> "relativeLinks" must be one of ` +
        `"gitlab", "keep", "site"; got ${JSON.stringify(attrs.relativeLinks)}.`,
    );
  }
  const linkBase = String(attrs.linkBase ?? ctx.options.linkBase ?? "").replace(/\/+$/, "");
  return { mode, linkBase };
}

/**
 * Builds the `transformLinkHref` hook for `renderMarkdown`, or `undefined` in
 * "keep" mode so no hrefs are visited at all.
 */
function linkHook(
  ctx: GitLabContext,
  link: LinkOpts,
  project: string,
  ref: string,
  basePath?: string,
): ((href: string) => Promise<string>) | undefined {
  if (link.mode === "keep") return undefined;
  return async (href: string) =>
    resolveRepoLink(href, {
      mode: link.mode,
      publicUrl: ctx.options.publicUrl ?? ctx.options.host,
      project,
      ref,
      basePath,
      linkBase: link.linkBase,
    });
}
```

- [ ] **Step 4: Wire `fetchReadme`**

Replace the body of `fetchReadme` with:

```ts
export async function fetchReadme(ctx: GitLabContext, attrs: Attrs): Promise<ReadmeData> {
  const project = String(attrs.project);
  const explicitRef = attrs.ref as string | undefined;
  const tocMode = readTocMode(attrs.toc);
  const link = readLinkOpts(ctx, attrs, "GitlabReadme");
  return memo(
    ctx,
    `readme:${project}:${explicitRef ?? "default"}:${tocMode}:${link.mode}:${link.linkBase}`,
    async () => {
      const ref =
        explicitRef ?? (await ctx.client.getProject(attrs.project as string | number)).default_branch;
      const rawMd = await ctx.client.getFileRaw(attrs.project as string | number, "README.md", ref);
      const md = await expandDirectives(ctx, project, ref, undefined, rawMd);
      const collectToc: TocEntry[] = [];
      const html = await renderMarkdown(md, {
        tocMode,
        collectToc,
        transformImageSrc: (src) => ctx.assets.localize(src, ref, project),
        transformLinkHref: linkHook(ctx, link, project, ref, "README.md"),
        renderChain: ctx.options.markdownRenderChain,
      });
      const result: ReadmeData = { ref, html };
      if (tocMode === "sidebar") result.toc = collectToc;
      return result;
    },
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts -t "fetchReadme"`

Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `pnpm exec vitest run && pnpm run typecheck`

Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -S -m "feat(readme): resolve relative links in GitlabReadme"
```

---

## Task 5: Wire `fetchFile` (markdown branch)

Relative links in a nested file resolve against **its own directory**, which is
why `basePath` is the file's `path` here and a literal `"README.md"` in Task 4.

**Files:**
- Modify: `src/gitlab/fetchers.ts` (`fetchFile` ~line 577)
- Test: `src/gitlab/fetchers.test.ts` (`describe("fetchFile", …)`)

- [ ] **Step 1: Write the failing test**

Append inside the `describe("fetchFile", …)` block:

```ts
  it("resolves relative links against the file's own directory", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[sibling](./b.md) [up](../top.md) [root](/LICENSE)"),
    };
    const data: any = await fetchFile(ctx(client), { project: "g/r", path: "docs/a.md" });
    expect(data.kind).toBe("markdown");
    expect(data.html).toContain('href="https://gitlab.com/g/r/-/blob/main/docs/b.md"');
    expect(data.html).toContain('href="https://gitlab.com/g/r/-/blob/main/top.md"');
    expect(data.html).toContain('href="https://gitlab.com/g/r/-/blob/main/LICENSE"');
  });

  it("keys the cache on relativeLinks so two modes do not collide", async () => {
    const client: any = {
      getProject: vi.fn(async () => ({ default_branch: "main" })),
      getFileRaw: vi.fn(async () => "[sibling](./b.md)"),
    };
    const c = ctx(client);
    const first: any = await fetchFile(c, { project: "g/r", path: "docs/a.md" });
    const second: any = await fetchFile(c, {
      project: "g/r",
      path: "docs/a.md",
      relativeLinks: "site",
      linkBase: "/repo",
    });
    expect(first.html).toContain('href="https://gitlab.com/g/r/-/blob/main/docs/b.md"');
    expect(second.html).toContain('href="/repo/docs/b"');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts -t "fetchFile"`

Expected: FAIL — hrefs come out as `./b.md`, `../top.md`, `/LICENSE`.

- [ ] **Step 3: Write the implementation**

In `fetchFile`, add the link options above the `memo` call, extend the memo key,
and pass the hook. The changed lines:

```ts
  const lines = attrs.lines as string | undefined;
  const link = readLinkOpts(ctx, attrs, "GitlabFile");
  return memo(
    ctx,
    `file:${String(project)}:${path}:${explicitRef ?? "default"}:${lines ?? ""}:${link.mode}:${link.linkBase}`,
    async () => {
```

and, inside the `/\.mdx?$/i` branch:

```ts
        const html = await renderMarkdown(expanded, {
          transformImageSrc: (src) => ctx.assets.localize(src, ref, String(project)),
          transformLinkHref: linkHook(ctx, link, String(project), ref, path),
          renderChain: ctx.options.markdownRenderChain,
        });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts -t "fetchFile"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -S -m "feat(file): resolve relative links in GitlabFile markdown"
```

---

## Task 6: Wire `fetchProjectInfo` descriptions and `fetchReleases` notes

Neither has a file to resolve against, so both omit `basePath` (repo root). The
refs differ: a description belongs to the default branch, a release note to its
own tag. `fetchProjectInfo` also calls `fetchReleases` internally, so it forwards
its own attributes down.

**Files:**
- Modify: `src/gitlab/fetchers.ts` (`fetchProjectInfo` ~line 92, `fetchReleases` ~line 148)
- Test: `src/gitlab/fetchers.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside `describe("fetchProjectInfo", …)`:

```ts
  it("rewrites relative links in the description at the default branch", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "see [docs](docs/x.md)",
        web_url: "https://gitlab.com/g/r", star_count: 0, forks_count: 0, topics: [],
        last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null, default_branch: "main",
      })),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const data = await fetchProjectInfo(ctx(client), { project: "g/r" });
    expect(data.descriptionHtml).toContain('href="https://gitlab.com/g/r/-/blob/main/docs/x.md"');
  });

  it("falls back to HEAD when the project has no default branch", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "see [docs](docs/x.md)",
        web_url: "https://gitlab.com/g/r", star_count: 0, forks_count: 0, topics: [],
        last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null, default_branch: null,
      })),
      getContributorsCount: vi.fn(async () => undefined),
    };
    const data = await fetchProjectInfo(ctx(client), { project: "g/r" });
    expect(data.descriptionHtml).toContain('href="https://gitlab.com/g/r/-/blob/HEAD/docs/x.md"');
  });
```

Append inside `describe("fetchReleases", …)`:

```ts
  it("rewrites relative links in release notes at the release tag", async () => {
    const client: any = {
      getReleases: vi.fn(async () => [
        {
          name: "v1", tag_name: "v1.0", released_at: "2026-01-01T00:00:00Z",
          description: "see [changelog](CHANGELOG.md)", assets: { links: [] },
          _links: { self: "https://gitlab.com/g/r/-/releases/v1.0" },
        },
      ]),
    };
    const [release] = await fetchReleases(ctx(client), { project: "g/r" });
    expect(release.descriptionHtml).toContain('href="https://gitlab.com/g/r/-/blob/v1.0/CHANGELOG.md"');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts -t "relative links"`

Expected: FAIL — hrefs are still `docs/x.md` and `CHANGELOG.md`.

- [ ] **Step 3: Implement `fetchProjectInfo`**

Add after the `readSectionLayout` validation calls:

```ts
  const link = readLinkOpts(ctx, attrs, "GitlabProjectInfo");
```

Extend the memo key:

```ts
  return memo(ctx, `projectInfo:${project}:r${rN}:c${cN}:i${iN}:${link.mode}:${link.linkBase}`, async () => {
```

Forward the attributes to the nested releases fetch so a `relativeLinks` set on
`<GitlabProjectInfo>` also governs the release notes it renders:

```ts
      section(rN, () =>
        fetchReleases(ctx, {
          project,
          limit: rN,
          relativeLinks: attrs.relativeLinks,
          linkBase: attrs.linkBase,
        }),
      ),
```

And rewrite the `descriptionHtml` line:

```ts
      descriptionHtml: await renderMarkdown(p.description ?? "", {
        transformLinkHref: linkHook(ctx, link, project, p.default_branch ?? "HEAD"),
        renderChain: ctx.options.markdownRenderChain,
      }),
```

- [ ] **Step 4: Implement `fetchReleases`**

Add above the `memo` call:

```ts
  const link = readLinkOpts(ctx, attrs, "GitlabReleases");
```

Extend the memo key:

```ts
  return memo(ctx, `releases:${project}:${limit}:${includePre}:${link.mode}:${link.linkBase}`, async () => {
```

And rewrite the `descriptionHtml` line inside the `.map`:

```ts
        descriptionHtml: await renderMarkdown(r.description ?? "", {
          transformLinkHref: linkHook(ctx, link, project, r.tag_name),
          renderChain: ctx.options.markdownRenderChain,
        }),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/gitlab/fetchers.test.ts`

Expected: PASS — the whole file, including the pre-existing tests.

- [ ] **Step 6: Run the full suite, typecheck, and lint**

Run: `pnpm exec vitest run && pnpm run typecheck && mise run lint`

Expected: PASS, no type errors, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -S -m "feat(links): resolve relative links in descriptions and release notes"
```

---

## Task 7: End-to-end guard in the stub build

Proves the links survive a real Docusaurus build into the emitted HTML — not just
the fetcher's return value. This test is slow (~1 min); run it explicitly.

**Files:**
- Modify: `test/e2e/fixtures.ts:107` (the stub README body)
- Test: `test/e2e/build.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/e2e/build.test.ts`, add a test inside the `describe("e2e: docusaurus build", …)`
block, next to the existing `"bakes project info, releases, and issues into the static html"`:

```ts
  it("rewrites the README's relative links to absolute GitLab blob URLs", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    expect(html).toContain("/-/blob/main/CONTRIBUTING.md");
  });
```

- [ ] **Step 2: Add the link to the stub README**

In `test/e2e/fixtures.ts`, the README body is a single string on line 107. Insert
a relative link after `"Readme body.\n\n"` so the string starts:

```ts
        "# Hello :rocket:\n\nReadme body.\n\nSee [contributing](./CONTRIBUTING.md).\n\n## Table of Contents\n\n",
```

Keep the rest of the string exactly as it is.

Note: `examples/site/docs/includes.mdx` renders the same README through the
`{@includeGitlabReadme}` path, where the link stays relative markdown and
Docusaurus resolves it itself. That site sets `onBrokenLinks: "ignore"`, so the
unresolvable `./CONTRIBUTING.md` there does not fail the build — expected, and the
reason `examples/site` keeps `"ignore"` in Task 8.

- [ ] **Step 3: Run the e2e test**

Run: `pnpm exec vitest run test/e2e/build.test.ts`

Expected: PASS — all e2e assertions, including the new one. Takes ~1 minute.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/fixtures.ts test/e2e/build.test.ts
git commit -S -m "test(e2e): assert README links are absolute in the built html"
```

---

## Task 8: Turn the showcase build into a regression guard

**Files:**
- Modify: `examples/gitlab/docusaurus.config.ts:27`

- [ ] **Step 1: Flip the setting**

Change line 27 from:

```ts
  onBrokenLinks: "ignore",
```

to:

```ts
  // Real regression guard: this site renders live gitlab.com READMEs, so a
  // relative link escaping into the HTML must fail the build.
  onBrokenLinks: "throw",
```

Leave `onBrokenMarkdownLinks: "ignore"` on line 28 alone — it governs Docusaurus's
own `.md`-to-`.md` resolution in authored docs and in `{@includeGitlab…}` output,
not the HTML this plugin injects.

Leave `examples/site/docusaurus.config.ts` on `"ignore"` — see the note in Task 7.

- [ ] **Step 2: Build the showcase site**

Run: `mise run gitlab:build`

Expected: build succeeds. **Needs network** (live gitlab.com). Set `GITLAB_TOKEN`
if you hit rate limits.

If it fails with broken links pointing at authored docs (not at fetched GitLab
markdown), fix those links — do not revert the flag. If it fails on a link inside
fetched README content, that is a real bug in Tasks 4–6: fix the resolver, not the
config.

- [ ] **Step 3: Commit**

```bash
git add examples/gitlab/docusaurus.config.ts
git commit -S -m "test(examples): fail the showcase build on broken links"
```

---

## Task 9: Documentation

**Files:**
- Modify: `README.md` (plugin options table ~line 439; `<GitlabReadme>` ~line 131)
- Modify: `examples/site/docs/components/readme.mdx`

- [ ] **Step 1: Add the plugin option rows**

In `README.md`, insert after the `assetBaseUrl` row of the plugin options table:

```markdown
| `publicUrl` | string | value of `host` | Public GitLab base URL used to build links to repository files. Set it when the build-time API host differs from the user-facing URL. Changing it does not invalidate cached HTML — clear `node_modules/.cache` or wait out the TTL |
| `relativeLinks` | `"gitlab" \| "site" \| "keep"` | `"gitlab"` | Where relative links in fetched markdown point. Overridable per component |
| `linkBase` | string | `""` | Site path the mirrored docs tree is mounted at, used by `relativeLinks: "site"`. Overridable per component |
```

- [ ] **Step 2: Add the "Link resolution" section**

In `README.md`, add a new `###` section immediately before `## Plugin options`:

````markdown
### Link resolution

Relative links inside fetched GitLab markdown (`[guide](./docs/guide.md)`) are
rewritten at build time. Without this, Docusaurus reads them as internal links
relative to the page they landed on and **fails the build** with
`Docusaurus found broken links!` — which is why sites embedding GitLab READMEs
used to need `onBrokenLinks: "ignore"`.

Three modes, set with the `relativeLinks` plugin option or the `relativeLinks`
attribute on any component that renders markdown (`<GitlabReadme>`,
`<GitlabFile>`, `<GitlabProjectInfo>`, `<GitlabReleases>`). The attribute wins.

| mode | `./docs/x.md` becomes | use it when |
|---|---|---|
| `gitlab` *(default)* | `https://gitlab.com/group/repo/-/blob/main/docs/x.md` | the site documents a repo it does not mirror |
| `site` | `/repo/docs/x` (with `linkBase="/repo"`) | the site mirrors the repo's markdown tree and links should stay in Docusaurus |
| `keep` | `./docs/x.md` | you rewrite links yourself via `outProcessors` or `markdownRenderChain` |

```mdx
<GitlabReadme project="group/repo" relativeLinks="site" linkBase="/repo" />
```

Anchors (`#install`), absolute URLs, and `mailto:` links are never touched. A
leading `/` is read as the **repository** root, matching how image paths are
resolved. Links always target `/-/blob/<ref>/…`; GitLab redirects to the tree
view when the path is a directory.

> **`site` mode links are checked by Docusaurus.** They are internal, so a wrong
> `linkBase` fails the build under `onBrokenLinks: "throw"`. That is deliberate —
> it reports a bad mapping instead of shipping dead links.

> **The `{@includeGitlabReadme}` / `{@includeGitlabFile}` placeholders need no
> flag.** They splice markdown into the MDX source, and Docusaurus resolves `.md`
> links against its own doc tree natively — the include path already behaves like
> `site` mode. `relativeLinks` applies to the `<Gitlab*>` components only.
````

- [ ] **Step 3: Add the component prop rows**

In `README.md`, add these two rows to the prop table of `<GitlabReadme>`,
`<GitlabFile>`, `<GitlabProjectInfo>`, and `<GitlabReleases>`:

```markdown
| `relativeLinks` | `"gitlab" \| "site" \| "keep"` | plugin option, else `"gitlab"` | Where relative links point — see [Link resolution](#link-resolution) |
| `linkBase` | string | plugin option, else `""` | Site path prefix for `relativeLinks="site"` |
```

While in the `<GitlabReadme>` section, the sentence "Images and badges are
downloaded and localized; links resolve back to GitLab" is now accurate — extend
it to "…; relative links resolve back to GitLab (configurable, see
[Link resolution](#link-resolution))".

- [ ] **Step 4: Update the example page**

In `examples/site/docs/components/readme.mdx`, add after the existing usage block:

````mdx
## Link resolution

Relative links in the README are rewritten to absolute GitLab URLs, so they do
not break the Docusaurus build. Point them at this site instead with
`relativeLinks="site"`:

```mdx
<GitlabReadme project="group/repo" relativeLinks="site" linkBase="/docs/mirror" />
```
````

- [ ] **Step 5: Verify the docs build**

Run: `mise run site:start` and open the `GitlabReadme` page, or simply confirm the
markdown renders in your editor's preview. The stub-backed `site:build` needs
`GITLAB_HOST` pointing at a stub, so it is not the check to run here.

- [ ] **Step 6: Commit**

```bash
git add README.md examples/site/docs/components/readme.mdx
git commit -S -m "docs: document link resolution and the relativeLinks flag"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full gate**

Run: `pnpm exec vitest run && pnpm run typecheck && mise run lint && pnpm run build`

Expected: all green.

- [ ] **Step 2: E2E**

Run: `pnpm exec vitest run test/e2e/build.test.ts`

Expected: PASS (~1 min).

- [ ] **Step 3: Showcase build**

Run: `mise run gitlab:build`

Expected: succeeds with `onBrokenLinks: "throw"`. Needs network.

- [ ] **Step 4: Confirm the commit signatures**

Run: `git log --format="%G? %h %s" -12`

Expected: every line starts with `G`.
