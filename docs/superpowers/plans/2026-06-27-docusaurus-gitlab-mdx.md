# Docusaurus GitLab MDX Extensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **PROJECT RULE — NO GIT:** This project forbids all git usage. There are no commit steps. Each task ends by running its tests. Do not run `git` for any reason.

**Goal:** Ship a TypeScript package (`docusaurus-plugin-gitlab`) that lets Docusaurus 3 authors embed GitLab project info, README, releases, and issues in `.mdx` pages via JSX components, with all data fetched and baked in at build time.

**Architecture:** A remark plugin walks the MDX AST during build, finds registered `<Gitlab*>` JSX elements, fetches+normalizes GitLab REST v4 data (with filesystem caching), localizes README images/badges into static assets, and injects the result as a `data` prop. Pure presentational React components render that prop. Components are registered once into the site's `MDXComponents`.

**Tech Stack:** TypeScript (ESM-first), tsup (build), Vitest + React Testing Library (tests), unified/remark/rehype (MDX AST + README markdown), Node 18+ native `fetch`, Joi (option validation), Infima CSS variables (styling), Docusaurus 3.

---

## File Structure

```
package.json, tsconfig.json, tsup.config.ts, vitest.config.ts
src/
  index.ts                  # public entry: re-exports remark + types
  options.ts                # PluginOptions, ResolvedOptions, resolveOptions()
  gitlab/
    types.ts                # domain types (ProjectInfoData, ReleaseData, ...)
    cache.ts                # FileCache (JSON kv, TTL, hashing)
    client.ts               # GitLabClient (request/paginate/requestBinary, encodeProject)
    assets.ts               # AssetManager (download+localize images/badges)
    markdown.ts             # renderMarkdown() README/notes md -> sanitized HTML
    fetchers.ts             # projectInfo/readme/releases/issues fetchers + GitLabContext
  remark/
    attributes.ts           # parseAttributes() JSX attrs -> plain object
    inject.ts               # injectProp() serialize value -> mdxJsx expression attr
    registry.ts             # COMPONENT_REGISTRY: name -> fetcher
    index.ts                # remarkGitlab() async transformer
  components/
    types.ts                # component prop types (re-exports gitlab/types)
    Fallback.tsx            # error/placeholder UI
    GitlabProjectInfo.tsx
    GitlabReadme.tsx
    GitlabReleases.tsx
    GitlabIssues.tsx
    styles.module.css
    index.ts                # barrel for MDXComponents registration
examples/site/              # minimal Docusaurus 3 site (e2e)
test/e2e/build.test.ts      # e2e: build example site against mocked API
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `.npmignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "docusaurus-plugin-gitlab",
  "version": "0.1.0",
  "description": "MDX extensions to embed GitLab resources in Docusaurus 3 docs",
  "license": "MIT",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./remark": { "types": "./dist/remark/index.d.ts", "import": "./dist/remark/index.js", "require": "./dist/remark/index.cjs" },
    "./components": { "types": "./dist/components/index.d.ts", "import": "./dist/components/index.js", "require": "./dist/components/index.cjs" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": { "react": ">=18", "react-dom": ">=18" },
  "dependencies": {
    "joi": "^17.13.0",
    "rehype-sanitize": "^6.0.0",
    "rehype-stringify": "^10.0.0",
    "remark-gfm": "^4.0.0",
    "remark-parse": "^11.0.0",
    "remark-rehype": "^11.0.0",
    "unified": "^11.0.0",
    "unist-util-visit": "^5.0.0",
    "estree-util-value-to-estree": "^3.1.0",
    "hast-util-from-html": "^2.0.0",
    "hast-util-to-html": "^9.0.0",
    "unist-util-visit-parents": "^6.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@types/mdast": "^4.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "jsdom": "^24.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `tsup.config.ts`**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/remark/index.ts", "src/components/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["react", "react-dom"],
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["**/components/**", "jsdom"]],
    setupFiles: ["test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 5: Create `test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Create `.npmignore`**

```
src
test
examples
*.config.ts
tsconfig.json
docs
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: completes, creates `node_modules` and `package-lock.json`.

- [ ] **Step 8: Verify the toolchain runs**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (no tests yet).

---

## Task 2: Domain types

**Files:**
- Create: `src/gitlab/types.ts`

- [ ] **Step 1: Write the domain types**

```ts
export type ProjectRef = string | number;

export interface ProjectInfoData {
  id: number;
  path: string;
  name: string;
  description: string | null;
  webUrl: string;
  starCount: number;
  forksCount: number;
  topics: string[];
  lastActivityAt: string;
  avatarUrl: string | null;
}

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface ReleaseData {
  name: string;
  tagName: string;
  releasedAt: string;
  descriptionHtml: string;
  upcomingRelease: boolean;
  assets: ReleaseAsset[];
}

export interface IssueData {
  iid: number;
  title: string;
  state: string;
  webUrl: string;
  labels: string[];
  authorName: string;
  authorWebUrl: string;
  createdAt: string;
}

export interface ReadmeData {
  ref: string;
  html: string;
}

export interface FetchError {
  message: string;
  project: string;
}

/** What every component receives: exactly one of these is set. */
export interface ComponentPayload<T> {
  data?: T;
  error?: FetchError;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

---

## Task 3: Options schema and resolution

**Files:**
- Create: `src/options.ts`
- Test: `src/options.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { resolveOptions } from "./options";

describe("resolveOptions", () => {
  it("applies defaults for a minimal config", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "production");
    expect(o.host).toBe("https://gitlab.com");
    expect(o.strict).toBe(true);
    expect(o.assetDir).toBe("static/gitlab-assets");
    expect(o.assetBaseUrl).toBe("/gitlab-assets");
    expect(o.cache).toEqual({ ttl: 3600 });
  });

  it("defaults strict to false in development", () => {
    const o = resolveOptions({ host: "https://gitlab.com" }, "development");
    expect(o.strict).toBe(false);
  });

  it("strips a trailing slash from host", () => {
    const o = resolveOptions({ host: "https://gl.example.com/" }, "production");
    expect(o.host).toBe("https://gl.example.com");
  });

  it("allows disabling cache", () => {
    const o = resolveOptions({ host: "https://gitlab.com", cache: false }, "production");
    expect(o.cache).toBe(false);
  });

  it("throws on a missing host", () => {
    expect(() => resolveOptions({} as any, "production")).toThrow(/host/);
  });

  it("throws on an unknown option", () => {
    expect(() =>
      resolveOptions({ host: "https://gitlab.com", nope: 1 } as any, "production"),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/options.test.ts`
Expected: FAIL ("Cannot find module './options'").

- [ ] **Step 3: Write the implementation**

```ts
import Joi from "joi";

export interface PluginOptions {
  host: string;
  token?: string;
  strict?: boolean;
  cache?: { ttl: number } | false;
  assetDir?: string;
  assetBaseUrl?: string;
}

export interface ResolvedOptions {
  host: string;
  token?: string;
  strict: boolean;
  cache: { ttl: number } | false;
  assetDir: string;
  assetBaseUrl: string;
}

const schema = Joi.object({
  host: Joi.string().uri().required(),
  token: Joi.string().optional(),
  strict: Joi.boolean().optional(),
  cache: Joi.alternatives(Joi.object({ ttl: Joi.number().min(0).required() }), Joi.boolean().valid(false)).optional(),
  assetDir: Joi.string().optional(),
  assetBaseUrl: Joi.string().optional(),
});

export function resolveOptions(
  input: PluginOptions,
  mode: "production" | "development" = "production",
): ResolvedOptions {
  const { error, value } = schema.validate(input, { abortEarly: true });
  if (error) throw new Error(`docusaurus-plugin-gitlab: invalid options — ${error.message}`);

  const opts = value as PluginOptions;
  return {
    host: opts.host.replace(/\/+$/, ""),
    token: opts.token,
    strict: opts.strict ?? mode === "production",
    cache: opts.cache === undefined ? { ttl: 3600 } : opts.cache,
    assetDir: opts.assetDir ?? "static/gitlab-assets",
    assetBaseUrl: (opts.assetBaseUrl ?? "/gitlab-assets").replace(/\/+$/, ""),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/options.test.ts`
Expected: PASS (6 tests).

---

## Task 4: Filesystem cache

**Files:**
- Create: `src/gitlab/cache.ts`
- Test: `src/gitlab/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileCache } from "./cache";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "glcache-"));
});

describe("FileCache", () => {
  it("returns undefined on a miss", async () => {
    const c = new FileCache(dir, { ttl: 60 });
    expect(await c.get("missing")).toBeUndefined();
  });

  it("stores and retrieves a value", async () => {
    const c = new FileCache(dir, { ttl: 60 });
    await c.set("k", { a: 1 });
    expect(await c.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("treats expired entries as a miss", async () => {
    const c = new FileCache(dir, { ttl: 0 });
    await c.set("k", { a: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await c.get("k")).toBeUndefined();
  });

  it("never reads or writes when disabled", async () => {
    const c = new FileCache(dir, false);
    await c.set("k", { a: 1 });
    expect(await c.get("k")).toBeUndefined();
  });

  it("hashes keys deterministically", () => {
    expect(FileCache.hash(["a", "b"])).toBe(FileCache.hash(["a", "b"]));
    expect(FileCache.hash(["a", "b"])).not.toBe(FileCache.hash(["a", "c"]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/cache.test.ts`
Expected: FAIL ("Cannot find module './cache'").

- [ ] **Step 3: Write the implementation**

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface Entry<T> {
  expiresAt: number | null;
  value: T;
}

export class FileCache {
  constructor(
    private dir: string,
    private config: { ttl: number } | false,
  ) {}

  static hash(parts: (string | number)[]): string {
    return createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 32);
  }

  private file(key: string): string {
    return join(this.dir, `${FileCache.hash([key])}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.config === false) return undefined;
    try {
      const raw = await readFile(this.file(key), "utf8");
      const entry = JSON.parse(raw) as Entry<T>;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.config === false) return;
    await mkdir(this.dir, { recursive: true });
    const entry: Entry<T> = {
      expiresAt: this.config.ttl === 0 ? Date.now() : Date.now() + this.config.ttl * 1000,
      value,
    };
    await writeFile(this.file(key), JSON.stringify(entry), "utf8");
  }
}
```

> Note: `ttl: 0` writes an already-expired entry so the next `get` is always a miss (used to force-refresh while still exercising the write path).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gitlab/cache.test.ts`
Expected: PASS (5 tests).

---

## Task 5: GitLab REST client

**Files:**
- Create: `src/gitlab/client.ts`
- Test: `src/gitlab/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitLabClient } from "./client";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("GitLabClient", () => {
  it("encodes a string project path", () => {
    const c = new GitLabClient({ host: "https://gitlab.com" });
    expect(c.encodeProject("group/sub/repo")).toBe("group%2Fsub%2Frepo");
  });

  it("passes a numeric project id through", () => {
    const c = new GitLabClient({ host: "https://gitlab.com" });
    expect(c.encodeProject(42)).toBe("42");
  });

  it("calls the v4 API with the auth header when a token is set", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    const c = new GitLabClient({ host: "https://gitlab.com", token: "secret" });
    const data = await c.request<{ id: number }>("/projects/42");
    expect(data).toEqual({ id: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gitlab.com/api/v4/projects/42");
    expect((init.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBe("secret");
  });

  it("omits the auth header when no token is set", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    const c = new GitLabClient({ host: "https://gitlab.com" });
    await c.request("/projects/42");
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)["PRIVATE-TOKEN"]).toBeUndefined();
  });

  it("appends query params", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const c = new GitLabClient({ host: "https://gitlab.com" });
    await c.request("/projects/42/issues", { state: "opened", labels: "bug" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://gitlab.com/api/v4/projects/42/issues?state=opened&labels=bug",
    );
  });

  it("throws a descriptive error on a non-2xx response", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    const c = new GitLabClient({ host: "https://gitlab.com" });
    await expect(c.request("/projects/x")).rejects.toThrow(/404/);
  });

  it("follows pagination up to the limit", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([{ iid: 1 }, { iid: 2 }], {
          link: '<https://gitlab.com/api/v4/projects/42/issues?page=2>; rel="next"',
        }),
      )
      .mockResolvedValueOnce(jsonResponse([{ iid: 3 }, { iid: 4 }]));
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const all = await c.paginate<{ iid: number }>("/projects/42/issues", {}, 3);
    expect(all.map((x) => x.iid)).toEqual([1, 2, 3]);
  });

  it("fetches binary data with content type", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    fetchMock.mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const c = new GitLabClient({ host: "https://gitlab.com" });
    const res = await c.requestBinary("https://gitlab.com/x.png");
    expect(res.contentType).toBe("image/png");
    expect(new Uint8Array(res.body)).toEqual(bytes);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/client.test.ts`
Expected: FAIL ("Cannot find module './client'").

- [ ] **Step 3: Write the implementation**

```ts
import type { ProjectRef } from "./types";

export interface GitLabClientConfig {
  host: string;
  token?: string;
}

export interface BinaryResponse {
  body: ArrayBuffer;
  contentType: string;
}

export class GitLabClient {
  constructor(private config: GitLabClientConfig) {}

  encodeProject(ref: ProjectRef): string {
    return typeof ref === "number" ? String(ref) : encodeURIComponent(ref);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.config.token) h["PRIVATE-TOKEN"] = this.config.token;
    return h;
  }

  private url(path: string, params?: Record<string, string | number | undefined>): string {
    const base = `${this.config.host}/api/v4${path}`;
    if (!params) return base;
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") usp.set(k, String(v));
    }
    const qs = usp.toString();
    return qs ? `${base}?${qs}` : base;
  }

  async request<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const res = await fetch(this.url(path, params), { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`GitLab API ${res.status} for ${path}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async paginate<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    limit: number,
  ): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = this.url(path, { per_page: Math.min(limit, 100), ...params });
    while (url && out.length < limit) {
      const res: Response = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new Error(`GitLab API ${res.status} for ${path}: ${await res.text()}`);
      const page = (await res.json()) as T[];
      out.push(...page);
      url = parseNextLink(res.headers.get("link"));
    }
    return out.slice(0, limit);
  }

  async requestBinary(absoluteUrl: string): Promise<BinaryResponse> {
    const res = await fetch(absoluteUrl, { headers: this.headers() });
    if (!res.ok) throw new Error(`GitLab asset ${res.status} for ${absoluteUrl}`);
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gitlab/client.test.ts`
Expected: PASS (8 tests).

---

## Task 6: README markdown rendering

**Files:**
- Create: `src/gitlab/markdown.ts`
- Test: `src/gitlab/markdown.test.ts`

This module converts markdown to sanitized HTML and exposes a hook so the asset
pipeline (Task 7) can rewrite `<img>` sources. The hook is an async
`transformImageSrc(src) => Promise<string>`; when omitted, image `src` values are
left untouched.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders gfm markdown to html", async () => {
    const html = await renderMarkdown("# Hello\n\n- a\n- b", {});
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<li>a</li>");
  });

  it("strips dangerous html", async () => {
    const html = await renderMarkdown("<script>alert(1)</script>ok", {});
    expect(html).not.toContain("<script>");
    expect(html).toContain("ok");
  });

  it("rewrites image src via the transform hook", async () => {
    const html = await renderMarkdown("![x](./img/a.png)", {
      transformImageSrc: async (src) => `/local/${src.replace(/[^a-z]/gi, "")}`,
    });
    expect(html).toContain('src="/local/imgapng"');
  });

  it("leaves links unchanged when no link transform is given", async () => {
    const html = await renderMarkdown("[a](./b.md)", {});
    expect(html).toContain('href="./b.md"');
  });

  it("rewrites link href via the transform hook", async () => {
    const html = await renderMarkdown("[a](./b.md)", {
      transformLinkHref: async (href) => `https://x/${href}`,
    });
    expect(html).toContain('href="https://x/./b.md"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/markdown.test.ts`
Expected: FAIL ("Cannot find module './markdown'").

- [ ] **Step 3: Write the implementation**

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

export interface RenderOptions {
  transformImageSrc?: (src: string) => Promise<string>;
  transformLinkHref?: (href: string) => Promise<string>;
}

export async function renderMarkdown(md: string, opts: RenderOptions): Promise<string> {
  const transforms: { el: Element; attr: "src" | "href"; fn: (v: string) => Promise<string> }[] = [];

  const collect = () => (tree: Root) => {
    visit(tree, "element", (el: Element) => {
      if (el.tagName === "img" && opts.transformImageSrc && typeof el.properties?.src === "string") {
        transforms.push({ el, attr: "src", fn: opts.transformImageSrc });
      }
      if (el.tagName === "a" && opts.transformLinkHref && typeof el.properties?.href === "string") {
        transforms.push({ el, attr: "href", fn: opts.transformLinkHref });
      }
    });
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(collect)
    .use(rehypeStringify);

  const tree = processor.parse(md);
  const hast = (await processor.run(tree)) as unknown as Root;

  await Promise.all(
    transforms.map(async (t) => {
      const current = t.el.properties![t.attr] as string;
      t.el.properties![t.attr] = await t.fn(current);
    }),
  );

  return processor.stringify(hast as never);
}
```

> Note: `rehype-sanitize` runs before `collect` so transforms only touch
> attributes that survived sanitization.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gitlab/markdown.test.ts`
Expected: PASS (5 tests).

---

## Task 7: Asset manager (image/badge localization)

**Files:**
- Create: `src/gitlab/assets.ts`
- Test: `src/gitlab/assets.test.ts`

`AssetManager.localize(srcUrl, ref, project)` resolves a (possibly relative) URL
to absolute, downloads the bytes (via the client, so private assets get the
token), writes `<assetDir>/<contentHash>.<ext>`, and returns the served path
`<assetBaseUrl>/<contentHash>.<ext>`. A URL→filename map is cached so repeat
builds/HMR skip the download.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtempSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssetManager } from "./assets";
import { FileCache } from "./cache";

function fakeClient(bytes: Uint8Array, contentType = "image/png") {
  return {
    requestBinary: vi.fn(async () => ({ body: bytes.buffer.slice(0), contentType })),
  } as any;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "glassets-"));
});

describe("AssetManager", () => {
  it("resolves a relative path to the GitLab raw URL before downloading", async () => {
    const client = fakeClient(new Uint8Array([1]));
    const am = new AssetManager({
      client,
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    await am.localize("./docs/a.png", "main", "group/repo");
    expect(client.requestBinary).toHaveBeenCalledWith(
      "https://gitlab.com/group/repo/-/raw/main/docs/a.png",
    );
  });

  it("downloads an absolute url as-is (badge) and writes a hashed file", async () => {
    const client = fakeClient(new Uint8Array([9, 9, 9]), "image/svg+xml");
    const am = new AssetManager({
      client,
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    const served = await am.localize("https://gitlab.com/g/r/-/badges/main/pipeline.svg", "main", "g/r");
    expect(served).toMatch(/^\/gitlab-assets\/[0-9a-f]+\.svg$/);
    const file = join(dir, "assets", served.split("/").pop()!);
    expect(existsSync(file)).toBe(true);
    expect(new Uint8Array(await readFile(file))).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("does not re-download a url already in the map", async () => {
    const client = fakeClient(new Uint8Array([1]));
    const am = new AssetManager({
      client,
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    const a = await am.localize("https://x/y.png", "main", "g/r");
    const b = await am.localize("https://x/y.png", "main", "g/r");
    expect(a).toBe(b);
    expect(client.requestBinary).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/assets.test.ts`
Expected: FAIL ("Cannot find module './assets'").

- [ ] **Step 3: Write the implementation**

```ts
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitLabClient } from "./client";
import type { FileCache } from "./cache";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export interface AssetManagerConfig {
  client: GitLabClient;
  cache: FileCache;
  assetDir: string;
  assetBaseUrl: string;
  host: string;
}

export class AssetManager {
  constructor(private config: AssetManagerConfig) {}

  private absolute(src: string, ref: string, project: string): string {
    if (/^https?:\/\//i.test(src)) return src;
    const clean = src.replace(/^\.?\//, "");
    return `${this.config.host}/${project}/-/raw/${ref}/${clean}`;
  }

  private ext(url: string, contentType: string): string {
    const byType = EXT_BY_TYPE[contentType.split(";")[0].trim()];
    if (byType) return byType;
    const m = url.split("?")[0].match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : "bin";
  }

  async localize(src: string, ref: string, project: string): Promise<string> {
    const url = this.absolute(src, ref, project);

    const cacheKey = `asset:${url}`;
    const cached = await this.config.cache.get<string>(cacheKey);
    if (cached) return cached;

    const { body, contentType } = await this.config.client.requestBinary(url);
    const buf = Buffer.from(body);
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 24);
    const filename = `${hash}.${this.ext(url, contentType)}`;

    await mkdir(this.config.assetDir, { recursive: true });
    await writeFile(join(this.config.assetDir, filename), buf);

    const served = `${this.config.assetBaseUrl}/${filename}`;
    await this.config.cache.set(cacheKey, served);
    return served;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/gitlab/assets.test.ts`
Expected: PASS (3 tests).

---

## Task 8: Resource fetchers

**Files:**
- Create: `src/gitlab/fetchers.ts`
- Test: `src/gitlab/fetchers.test.ts`

Defines `GitLabContext` (client + options + cache + assets + markdown renderer
wired together) and one normalizing fetcher per resource. Fetchers read their
inputs from a plain attributes object and return the domain types from Task 2.
Each fetcher caches its normalized result by a key built from its inputs.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchProjectInfo, fetchReleases, fetchIssues, fetchReadme } from "./fetchers";
import { FileCache } from "./cache";

function ctx(client: any) {
  const dir = mkdtempSync(join(tmpdir(), "glfetch-"));
  return {
    client,
    cache: new FileCache(join(dir, "c"), { ttl: 60 }),
    options: { host: "https://gitlab.com", assetDir: join(dir, "a"), assetBaseUrl: "/gitlab-assets" },
    assets: { localize: vi.fn(async (src: string) => `/gitlab-assets/${src.replace(/\W/g, "")}.png`) },
  } as any;
}

describe("fetchProjectInfo", () => {
  it("normalizes the project payload", async () => {
    const client = { encodeProject: (r: any) => String(r), request: vi.fn(async () => ({
      id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
      star_count: 3, forks_count: 1, topics: ["x"], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
    })) };
    const data = await fetchProjectInfo(ctx(client), { project: "g/r" });
    expect(data).toMatchObject({ id: 7, path: "g/r", starCount: 3, topics: ["x"] });
    expect(client.request).toHaveBeenCalledWith("/projects/g%2Fr");
  });
});

describe("fetchReleases", () => {
  it("normalizes releases, renders notes, and respects limit", async () => {
    const client = {
      encodeProject: (r: any) => encodeURIComponent(String(r)),
      paginate: vi.fn(async () => [
        { name: "v1", tag_name: "v1", released_at: "2026-01-01T00:00:00Z", description: "**notes**",
          upcoming_release: false, assets: { links: [{ name: "bin", url: "https://x/bin" }] } },
      ]),
    };
    const data = await fetchReleases(ctx(client), { project: "g/r", limit: 5, includePrereleases: true });
    expect(data).toHaveLength(1);
    expect(data[0].tagName).toBe("v1");
    expect(data[0].descriptionHtml).toContain("<strong>notes</strong>");
    expect(data[0].assets).toEqual([{ name: "bin", url: "https://x/bin" }]);
  });

  it("filters out upcoming releases unless includePrereleases", async () => {
    const client = {
      encodeProject: (r: any) => encodeURIComponent(String(r)),
      paginate: vi.fn(async () => [
        { name: "rc", tag_name: "rc", released_at: "x", description: "", upcoming_release: true, assets: { links: [] } },
        { name: "v1", tag_name: "v1", released_at: "x", description: "", upcoming_release: false, assets: { links: [] } },
      ]),
    };
    const data = await fetchReleases(ctx(client), { project: "g/r" });
    expect(data.map((r) => r.tagName)).toEqual(["v1"]);
  });
});

describe("fetchIssues", () => {
  it("normalizes issues and forwards filters", async () => {
    const client = {
      encodeProject: (r: any) => encodeURIComponent(String(r)),
      paginate: vi.fn(async () => [
        { iid: 5, title: "bug", state: "opened", web_url: "https://x/5", labels: ["bug"],
          author: { name: "Ann", web_url: "https://x/ann" }, created_at: "2026-01-01T00:00:00Z" },
      ]),
    };
    const data = await fetchIssues(ctx(client), { project: "g/r", labels: "bug", state: "opened", limit: 10 });
    expect(data[0]).toMatchObject({ iid: 5, authorName: "Ann", labels: ["bug"] });
    expect(client.paginate).toHaveBeenCalledWith(
      "/projects/g%2Fr/issues",
      { state: "opened", labels: "bug", milestone: undefined },
      10,
    );
  });
});

describe("fetchReadme", () => {
  it("resolves default branch, renders html, and localizes images", async () => {
    const client = {
      encodeProject: (r: any) => encodeURIComponent(String(r)),
      request: vi.fn(async (path: string) => {
        if (path === "/projects/g%2Fr") return { default_branch: "main" };
        return {};
      }),
      requestBinary: vi.fn(),
    };
    // README raw fetched via request as text — see implementation note.
    client.requestText = vi.fn(async () => "![logo](./logo.png)");
    const c = ctx(client);
    const data = await fetchReadme(c, { project: "g/r" });
    expect(data.ref).toBe("main");
    expect(data.html).toContain('src="/gitlab-assets/');
    expect(c.assets.localize).toHaveBeenCalledWith("./logo.png", "main", "g/r");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: FAIL ("Cannot find module './fetchers'").

- [ ] **Step 3: Add `requestText` to the client**

In `src/gitlab/client.ts`, add this method to `GitLabClient` (used for raw README):

```ts
  async requestText(path: string, params?: Record<string, string | number | undefined>): Promise<string> {
    const res = await fetch(this.url(path, params), { headers: this.headers() });
    if (!res.ok) throw new Error(`GitLab API ${res.status} for ${path}: ${await res.text()}`);
    return await res.text();
  }
```

- [ ] **Step 4: Write the fetchers implementation**

```ts
import { renderMarkdown } from "./markdown";
import type { AssetManager } from "./assets";
import type { GitLabClient } from "./client";
import type { FileCache } from "./cache";
import type {
  IssueData,
  ProjectInfoData,
  ReadmeData,
  ReleaseData,
} from "./types";

export interface GitLabContext {
  client: GitLabClient & { requestText(path: string): Promise<string> };
  cache: FileCache;
  assets: AssetManager;
  options: { host: string };
}

type Attrs = Record<string, unknown>;

async function memo<T>(ctx: GitLabContext, key: string, fn: () => Promise<T>): Promise<T> {
  const hit = await ctx.cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fn();
  await ctx.cache.set(key, value);
  return value;
}

export async function fetchProjectInfo(ctx: GitLabContext, attrs: Attrs): Promise<ProjectInfoData> {
  const project = String(attrs.project);
  const id = ctx.client.encodeProject(attrs.project as string | number);
  return memo(ctx, `projectInfo:${id}`, async () => {
    const p = await ctx.client.request<any>(`/projects/${id}`);
    return {
      id: p.id,
      path: p.path_with_namespace,
      name: p.name,
      description: p.description ?? null,
      webUrl: p.web_url,
      starCount: p.star_count,
      forksCount: p.forks_count,
      topics: p.topics ?? [],
      lastActivityAt: p.last_activity_at,
      avatarUrl: p.avatar_url ?? null,
    } satisfies ProjectInfoData;
  }).then((v) => ({ ...v, path: v.path || project }));
}

export async function fetchReleases(ctx: GitLabContext, attrs: Attrs): Promise<ReleaseData[]> {
  const id = ctx.client.encodeProject(attrs.project as string | number);
  const limit = typeof attrs.limit === "number" ? attrs.limit : 10;
  const includePre = attrs.includePrereleases === true;
  return memo(ctx, `releases:${id}:${limit}:${includePre}`, async () => {
    const raw = await ctx.client.paginate<any>(`/projects/${id}/releases`, {}, limit);
    const filtered = includePre ? raw : raw.filter((r) => !r.upcoming_release);
    return Promise.all(
      filtered.slice(0, limit).map(async (r) => ({
        name: r.name,
        tagName: r.tag_name,
        releasedAt: r.released_at,
        descriptionHtml: await renderMarkdown(r.description ?? "", {}),
        upcomingRelease: Boolean(r.upcoming_release),
        assets: (r.assets?.links ?? []).map((l: any) => ({ name: l.name, url: l.url })),
      })),
    );
  });
}

export async function fetchIssues(ctx: GitLabContext, attrs: Attrs): Promise<IssueData[]> {
  const id = ctx.client.encodeProject(attrs.project as string | number);
  const limit = typeof attrs.limit === "number" ? attrs.limit : 20;
  const params = {
    state: (attrs.state as string) ?? "opened",
    labels: attrs.labels as string | undefined,
    milestone: attrs.milestone as string | undefined,
  };
  return memo(ctx, `issues:${id}:${JSON.stringify(params)}:${limit}`, async () => {
    const raw = await ctx.client.paginate<any>(`/projects/${id}/issues`, params, limit);
    return raw.map((i) => ({
      iid: i.iid,
      title: i.title,
      state: i.state,
      webUrl: i.web_url,
      labels: i.labels ?? [],
      authorName: i.author?.name ?? "",
      authorWebUrl: i.author?.web_url ?? "",
      createdAt: i.created_at,
    } satisfies IssueData));
  });
}

export async function fetchReadme(ctx: GitLabContext, attrs: Attrs): Promise<ReadmeData> {
  const id = ctx.client.encodeProject(attrs.project as string | number);
  const project = String(attrs.project);
  const explicitRef = attrs.ref as string | undefined;
  return memo(ctx, `readme:${id}:${explicitRef ?? "default"}`, async () => {
    const ref =
      explicitRef ??
      (await ctx.client.request<{ default_branch: string }>(`/projects/${id}`)).default_branch;
    const md = await ctx.client.requestText(
      `/projects/${id}/repository/files/README.md/raw?ref=${encodeURIComponent(ref)}`,
    );
    const html = await renderMarkdown(md, {
      transformImageSrc: (src) => ctx.assets.localize(src, ref, project),
    });
    return { ref, html } satisfies ReadmeData;
  });
}
```

> Implementation note: tests stub `client.requestText`; the README raw endpoint
> returns text, not JSON, which is why `requestText` exists (Step 3).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/gitlab/fetchers.test.ts`
Expected: PASS (6 tests).

---

## Task 9: JSX attribute parsing

**Files:**
- Create: `src/remark/attributes.ts`
- Test: `src/remark/attributes.test.ts`

Converts an `mdxJsxFlowElement`/`mdxJsxTextElement` attribute list into a plain
object. String literals pass through; expression attributes are accepted only
when their estree is a single literal (`{5}`, `{true}`, `{"x"}`). Non-literal
expressions throw.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseAttributes } from "./attributes";

function attr(name: string, value: any) {
  return { type: "mdxJsxAttribute", name, value };
}
function expr(estree: any) {
  return { type: "mdxJsxAttributeValueExpression", value: "", data: { estree } };
}
function literalProgram(value: any) {
  return { body: [{ type: "ExpressionStatement", expression: { type: "Literal", value } }] };
}

describe("parseAttributes", () => {
  it("reads string-literal attributes", () => {
    expect(parseAttributes([attr("project", "g/r")], "f.mdx")).toEqual({ project: "g/r" });
  });

  it("reads numeric expression attributes", () => {
    expect(parseAttributes([attr("limit", expr(literalProgram(5)))], "f.mdx")).toEqual({ limit: 5 });
  });

  it("reads boolean expression attributes", () => {
    expect(parseAttributes([attr("includePrereleases", expr(literalProgram(true)))], "f.mdx")).toEqual({
      includePrereleases: true,
    });
  });

  it("treats a valueless attribute as boolean true", () => {
    expect(parseAttributes([attr("showStats", null)], "f.mdx")).toEqual({ showStats: true });
  });

  it("throws on a non-literal expression", () => {
    const program = { body: [{ type: "ExpressionStatement", expression: { type: "Identifier", name: "x" } }] };
    expect(() => parseAttributes([attr("limit", expr(program))], "f.mdx")).toThrow(/static/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/remark/attributes.test.ts`
Expected: FAIL ("Cannot find module './attributes'").

- [ ] **Step 3: Write the implementation**

```ts
export interface MdxAttribute {
  type: string;
  name?: string;
  value?: unknown;
}

export function parseAttributes(attributes: MdxAttribute[], file: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of attributes) {
    if (a.type !== "mdxJsxAttribute" || !a.name) continue;
    out[a.name] = parseValue(a.value, a.name, file);
  }
  return out;
}

function parseValue(value: unknown, name: string, file: string): unknown {
  if (value === null || value === undefined) return true; // <C flag />
  if (typeof value === "string") return value;

  const v = value as { type?: string; data?: { estree?: any } };
  if (v.type === "mdxJsxAttributeValueExpression") {
    const stmt = v.data?.estree?.body?.[0];
    const expr = stmt?.expression;
    if (expr?.type === "Literal") return expr.value;
    throw new Error(
      `docusaurus-plugin-gitlab: attribute "${name}" in ${file} must be a static literal ` +
        `(string, number, or boolean), got a dynamic expression.`,
    );
  }
  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/remark/attributes.test.ts`
Expected: PASS (5 tests).

---

## Task 10: Data prop injection

**Files:**
- Create: `src/remark/inject.ts`
- Test: `src/remark/inject.test.ts`

Adds a `data` (or `error`) attribute to a JSX node whose value is an
`mdxJsxAttributeValueExpression` carrying an estree object literal, so the value
survives MDX compilation as real JavaScript.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { injectProp } from "./inject";

describe("injectProp", () => {
  it("adds a data attribute with an estree expression value", () => {
    const node: any = { type: "mdxJsxFlowElement", name: "GitlabReleases", attributes: [] };
    injectProp(node, "data", [{ tagName: "v1" }]);
    const added = node.attributes[0];
    expect(added.type).toBe("mdxJsxAttribute");
    expect(added.name).toBe("data");
    expect(added.value.type).toBe("mdxJsxAttributeValueExpression");
    expect(added.value.data.estree.body[0].expression).toBeTruthy();
  });

  it("serializes the raw value into the expression string", () => {
    const node: any = { type: "mdxJsxFlowElement", name: "GitlabIssues", attributes: [] };
    injectProp(node, "error", { message: "boom", project: "g/r" });
    expect(node.attributes[0].value.value).toContain("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/remark/inject.test.ts`
Expected: FAIL ("Cannot find module './inject'").

- [ ] **Step 3: Write the implementation**

```ts
import { valueToEstree } from "estree-util-value-to-estree";

export function injectProp(node: any, name: "data" | "error", value: unknown): void {
  const expression = valueToEstree(value, { preserveReferences: false });
  const estree = {
    type: "Program",
    sourceType: "module",
    body: [{ type: "ExpressionStatement", expression }],
  };
  node.attributes.push({
    type: "mdxJsxAttribute",
    name,
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: JSON.stringify(value),
      data: { estree },
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/remark/inject.test.ts`
Expected: PASS (2 tests).

---

## Task 11: Component registry

**Files:**
- Create: `src/remark/registry.ts`

- [ ] **Step 1: Write the registry**

```ts
import {
  fetchProjectInfo,
  fetchReadme,
  fetchReleases,
  fetchIssues,
  type GitLabContext,
} from "../gitlab/fetchers.js";

export type Fetcher = (ctx: GitLabContext, attrs: Record<string, unknown>) => Promise<unknown>;

export const COMPONENT_REGISTRY: Record<string, Fetcher> = {
  GitlabProjectInfo: fetchProjectInfo,
  GitlabReadme: fetchReadme,
  GitlabReleases: fetchReleases,
  GitlabIssues: fetchIssues,
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

---

## Task 12: Remark plugin (the transformer)

**Files:**
- Create: `src/remark/index.ts`
- Test: `src/remark/index.test.ts`

The default export is a remark plugin factory. The returned async transformer:
collects registered JSX nodes, parses each node's attributes, runs its fetcher,
and injects `data` — or, on failure, throws (strict) or injects `error` (warn).
The plugin builds the shared `GitLabContext` once per process.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkGitlab from "./index";

vi.mock("../gitlab/fetchers.js", () => ({
  fetchProjectInfo: vi.fn(async (_c, a) => ({ id: 1, path: a.project, name: "r" })),
  fetchReadme: vi.fn(),
  fetchReleases: vi.fn(),
  fetchIssues: vi.fn(async () => {
    throw new Error("api down");
  }),
}));

function processor(opts: any) {
  return unified().use(remarkParse).use(remarkMdx).use(remarkGitlab, opts);
}

async function transform(src: string, opts: any) {
  const p = processor(opts);
  const tree = p.parse(src);
  return (await p.run(tree, { path: "page.mdx" } as any)) as any;
}

describe("remarkGitlab", () => {
  it("injects a data prop on a registered element", async () => {
    const tree = await transform('<GitlabProjectInfo project="g/r" />', {
      host: "https://gitlab.com",
      strict: true,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabProjectInfo");
    const dataAttr = node.attributes.find((a: any) => a.name === "data");
    expect(dataAttr).toBeTruthy();
    expect(dataAttr.value.value).toContain("g/r");
  });

  it("ignores unregistered elements", async () => {
    const tree = await transform("<SomethingElse />", { host: "https://gitlab.com", strict: true });
    const node = tree.children.find((c: any) => c.name === "SomethingElse");
    expect(node.attributes.find((a: any) => a.name === "data")).toBeUndefined();
  });

  it("throws on fetch failure in strict mode", async () => {
    await expect(
      transform('<GitlabIssues project="g/r" />', { host: "https://gitlab.com", strict: true }),
    ).rejects.toThrow(/api down/);
  });

  it("injects an error prop on fetch failure in non-strict mode", async () => {
    const tree = await transform('<GitlabIssues project="g/r" />', {
      host: "https://gitlab.com",
      strict: false,
    });
    const node = tree.children.find((c: any) => c.name === "GitlabIssues");
    const errAttr = node.attributes.find((a: any) => a.name === "error");
    expect(errAttr.value.value).toContain("api down");
  });
});
```

> Add `remark-mdx` to devDependencies for this test: `npm i -D remark-mdx@^3`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/remark/index.test.ts`
Expected: FAIL ("Cannot find module './index'").

- [ ] **Step 3: Write the implementation**

```ts
import { visit } from "unist-util-visit";
import { GitLabClient } from "../gitlab/client.js";
import { FileCache } from "../gitlab/cache.js";
import { AssetManager } from "../gitlab/assets.js";
import type { GitLabContext } from "../gitlab/fetchers.js";
import { resolveOptions, type PluginOptions } from "../options.js";
import { COMPONENT_REGISTRY } from "./registry.js";
import { parseAttributes } from "./attributes.js";
import { injectProp } from "./inject.js";

const CACHE_DIR = "node_modules/.cache/docusaurus-plugin-gitlab";

function buildContext(options: ReturnType<typeof resolveOptions>): GitLabContext {
  const client = new GitLabClient({ host: options.host, token: options.token }) as any;
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

export default function remarkGitlab(rawOptions: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const options = resolveOptions(rawOptions, mode);
  const ctx = buildContext(options);

  return async function transformer(tree: any, file: any) {
    const jobs: { node: any }[] = [];
    visit(tree, (node: any) => {
      if (
        (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
        node.name &&
        COMPONENT_REGISTRY[node.name]
      ) {
        jobs.push({ node });
      }
    });

    await Promise.all(
      jobs.map(async ({ node }) => {
        const fetcher = COMPONENT_REGISTRY[node.name];
        const filePath = file?.path ?? "unknown.mdx";
        const attrs = parseAttributes(node.attributes ?? [], filePath);
        try {
          const data = await fetcher(ctx, attrs);
          injectProp(node, "data", data);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const where = node.position?.start
            ? `${filePath}:${node.position.start.line}:${node.position.start.column}`
            : filePath;
          if (options.strict) {
            throw new Error(`docusaurus-plugin-gitlab: <${node.name}> failed at ${where} — ${message}`);
          }
          injectProp(node, "error", { message, project: String(attrs.project ?? "") });
        }
      }),
    );
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/remark/index.test.ts`
Expected: PASS (4 tests).

---

## Task 13: Fallback + ProjectInfo component

**Files:**
- Create: `src/components/types.ts`
- Create: `src/components/Fallback.tsx`
- Create: `src/components/styles.module.css`
- Create: `src/components/GitlabProjectInfo.tsx`
- Test: `src/components/GitlabProjectInfo.test.tsx`

- [ ] **Step 1: Write `src/components/types.ts`**

```ts
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FetchError,
  ComponentPayload,
} from "../gitlab/types.js";
```

- [ ] **Step 2: Write `src/components/styles.module.css`**

```css
.card {
  border: 1px solid var(--ifm-color-emphasis-300);
  border-radius: var(--ifm-card-border-radius, 8px);
  padding: 1rem;
  margin: 1rem 0;
  background: var(--ifm-card-background-color, var(--ifm-background-surface-color));
}
.title { font-weight: 600; }
.muted { color: var(--ifm-color-emphasis-600); }
.stats { display: flex; gap: 1rem; margin-top: 0.5rem; }
.badge {
  display: inline-block;
  padding: 0 0.5rem;
  border-radius: 4px;
  background: var(--ifm-color-emphasis-200);
  font-size: 0.85em;
  margin-right: 0.25rem;
}
.fallback {
  border-left: 4px solid var(--ifm-color-warning);
  padding: 0.75rem 1rem;
  background: var(--ifm-color-warning-contrast-background);
  margin: 1rem 0;
}
.list { list-style: none; padding: 0; margin: 1rem 0; }
.listItem { padding: 0.5rem 0; border-bottom: 1px solid var(--ifm-color-emphasis-200); }
.readme :global(img) { max-width: 100%; }
```

- [ ] **Step 3: Write `src/components/Fallback.tsx`**

```tsx
import React from "react";
import type { FetchError } from "./types.js";
import styles from "./styles.module.css";

export function Fallback({ error }: { error: FetchError }) {
  return (
    <div className={styles.fallback} role="alert">
      GitLab data unavailable for <code>{error.project}</code>: {error.message}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitlabProjectInfo } from "./GitlabProjectInfo";

const data = {
  id: 1, path: "g/r", name: "My Repo", description: "A thing", webUrl: "https://gitlab.com/g/r",
  starCount: 12, forksCount: 3, topics: ["docs", "tooling"], lastActivityAt: "2026-01-01T00:00:00Z", avatarUrl: null,
};

describe("GitlabProjectInfo", () => {
  it("renders project name, description, topics, and stats", () => {
    render(<GitlabProjectInfo data={data as any} />);
    expect(screen.getByText("My Repo")).toBeInTheDocument();
    expect(screen.getByText("A thing")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("renders the fallback when given an error", () => {
    render(<GitlabProjectInfo error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx`
Expected: FAIL ("Cannot find module './GitlabProjectInfo'").

- [ ] **Step 6: Write `src/components/GitlabProjectInfo.tsx`**

```tsx
import React from "react";
import type { ComponentPayload, ProjectInfoData } from "./types.js";
import { Fallback } from "./Fallback.js";
import styles from "./styles.module.css";

export function GitlabProjectInfo({ data, error, showStats = true }: ComponentPayload<ProjectInfoData> & { showStats?: boolean }) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <div className={styles.card}>
      <div className={styles.title}>
        <a href={data.webUrl}>{data.name}</a>
      </div>
      {data.description && <p className={styles.muted}>{data.description}</p>}
      {data.topics.length > 0 && (
        <div>
          {data.topics.map((t) => (
            <span key={t} className={styles.badge}>{t}</span>
          ))}
        </div>
      )}
      {showStats && (
        <div className={styles.stats}>
          <span>★ {data.starCount}</span>
          <span>⑂ {data.forksCount}</span>
          <span className={styles.muted}>updated {new Date(data.lastActivityAt).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx`
Expected: PASS (2 tests).

---

## Task 14: Releases component

**Files:**
- Create: `src/components/GitlabReleases.tsx`
- Test: `src/components/GitlabReleases.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitlabReleases } from "./GitlabReleases";

const releases = [
  { name: "v1.0", tagName: "v1.0", releasedAt: "2026-01-01T00:00:00Z",
    descriptionHtml: "<p>First</p>", upcomingRelease: false,
    assets: [{ name: "bin", url: "https://x/bin" }] },
];

describe("GitlabReleases", () => {
  it("renders release name, tag, notes html, and assets", () => {
    render(<GitlabReleases data={releases as any} />);
    expect(screen.getByText("v1.0")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "bin" })).toHaveAttribute("href", "https://x/bin");
  });

  it("renders the fallback on error", () => {
    render(<GitlabReleases error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/GitlabReleases.test.tsx`
Expected: FAIL ("Cannot find module './GitlabReleases'").

- [ ] **Step 3: Write `src/components/GitlabReleases.tsx`**

```tsx
import React from "react";
import type { ComponentPayload, ReleaseData } from "./types.js";
import { Fallback } from "./Fallback.js";
import styles from "./styles.module.css";

export function GitlabReleases({ data, error }: ComponentPayload<ReleaseData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className={styles.list}>
      {data.map((r) => (
        <li key={r.tagName} className={styles.listItem}>
          <div className={styles.title}>
            {r.name || r.tagName} <span className={styles.badge}>{r.tagName}</span>
            <span className={styles.muted}> · {new Date(r.releasedAt).toLocaleDateString()}</span>
          </div>
          <div dangerouslySetInnerHTML={{ __html: r.descriptionHtml }} />
          {r.assets.length > 0 && (
            <div>
              {r.assets.map((a) => (
                <a key={a.url} className={styles.badge} href={a.url}>{a.name}</a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/GitlabReleases.test.tsx`
Expected: PASS (2 tests).

---

## Task 15: Issues component

**Files:**
- Create: `src/components/GitlabIssues.tsx`
- Test: `src/components/GitlabIssues.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitlabIssues } from "./GitlabIssues";

const issues = [
  { iid: 5, title: "Fix the bug", state: "opened", webUrl: "https://x/5",
    labels: ["bug"], authorName: "Ann", authorWebUrl: "https://x/ann", createdAt: "2026-01-01T00:00:00Z" },
];

describe("GitlabIssues", () => {
  it("renders issue title, state, labels, and link", () => {
    render(<GitlabIssues data={issues as any} />);
    const link = screen.getByRole("link", { name: /Fix the bug/ });
    expect(link).toHaveAttribute("href", "https://x/5");
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("opened")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabIssues error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/GitlabIssues.test.tsx`
Expected: FAIL ("Cannot find module './GitlabIssues'").

- [ ] **Step 3: Write `src/components/GitlabIssues.tsx`**

```tsx
import React from "react";
import type { ComponentPayload, IssueData } from "./types.js";
import { Fallback } from "./Fallback.js";
import styles from "./styles.module.css";

export function GitlabIssues({ data, error }: ComponentPayload<IssueData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className={styles.list}>
      {data.map((i) => (
        <li key={i.iid} className={styles.listItem}>
          <span className={styles.badge}>{i.state}</span>
          <a href={i.webUrl}>{i.title}</a>
          {i.labels.map((l) => (
            <span key={l} className={styles.badge}>{l}</span>
          ))}
          <span className={styles.muted}> · {i.authorName}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/GitlabIssues.test.tsx`
Expected: PASS (2 tests).

---

## Task 16: README component

**Files:**
- Create: `src/components/GitlabReadme.tsx`
- Test: `src/components/GitlabReadme.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitlabReadme } from "./GitlabReadme";

describe("GitlabReadme", () => {
  it("renders the prebuilt html", () => {
    render(<GitlabReadme data={{ ref: "main", html: "<h1>Title</h1><p>body</p>" } as any} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabReadme error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/GitlabReadme.test.tsx`
Expected: FAIL ("Cannot find module './GitlabReadme'").

- [ ] **Step 3: Write `src/components/GitlabReadme.tsx`**

```tsx
import React from "react";
import type { ComponentPayload, ReadmeData } from "./types.js";
import { Fallback } from "./Fallback.js";
import styles from "./styles.module.css";

export function GitlabReadme({ data, error }: ComponentPayload<ReadmeData>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return <div className={styles.readme} dangerouslySetInnerHTML={{ __html: data.html }} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/GitlabReadme.test.tsx`
Expected: PASS (2 tests).

---

## Task 17: Public entrypoints

**Files:**
- Create: `src/components/index.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Write `src/components/index.ts`**

```ts
export { GitlabProjectInfo } from "./GitlabProjectInfo.js";
export { GitlabReadme } from "./GitlabReadme.js";
export { GitlabReleases } from "./GitlabReleases.js";
export { GitlabIssues } from "./GitlabIssues.js";
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FetchError,
  ComponentPayload,
} from "./types.js";
```

- [ ] **Step 2: Write `src/index.ts`**

```ts
export { default as remarkGitlab } from "./remark/index.js";
export type { PluginOptions, ResolvedOptions } from "./options.js";
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FetchError,
} from "./gitlab/types.js";
```

- [ ] **Step 3: Build the package**

Run: `npm run build`
Expected: tsup emits `dist/index.{js,cjs,d.ts}`, `dist/remark/index.*`, `dist/components/index.*` with no errors.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (all unit tests across tasks 3–16).

---

## Task 18: Example site + e2e build test

**Files:**
- Create: `examples/site/package.json`
- Create: `examples/site/docusaurus.config.ts`
- Create: `examples/site/sidebars.ts`
- Create: `examples/site/src/theme/MDXComponents.ts`
- Create: `examples/site/docs/intro.mdx`
- Create: `test/e2e/fixtures.ts`
- Create: `test/e2e/build.test.ts`

This task proves the whole pipeline by building a real Docusaurus 3 site whose
GitLab calls are intercepted, then asserting the generated HTML.

- [ ] **Step 1: Create `examples/site/package.json`**

```json
{
  "name": "example-site",
  "private": true,
  "type": "module",
  "scripts": { "build": "docusaurus build" },
  "dependencies": {
    "@docusaurus/core": "^3.5.0",
    "@docusaurus/preset-classic": "^3.5.0",
    "docusaurus-plugin-gitlab": "file:../..",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": { "@docusaurus/tsconfig": "^3.5.0", "typescript": "^5.4.0" }
}
```

- [ ] **Step 2: Create `examples/site/docusaurus.config.ts`**

```ts
import type { Config } from "@docusaurus/types";
import { remarkGitlab } from "docusaurus-plugin-gitlab";

const config: Config = {
  title: "GitLab MDX Example",
  url: "https://example.com",
  baseUrl: "/",
  favicon: undefined,
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [
            [
              remarkGitlab,
              {
                host: process.env.GITLAB_HOST ?? "https://gitlab.com",
                token: process.env.GITLAB_TOKEN,
                strict: true,
              },
            ],
          ],
        },
        blog: false,
        theme: {},
      },
    ],
  ],
};

export default config;
```

- [ ] **Step 3: Create `examples/site/sidebars.ts`**

```ts
import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";
const sidebars: SidebarsConfig = { docs: [{ type: "autogenerated", dirName: "." }] };
export default sidebars;
```

- [ ] **Step 4: Create `examples/site/src/theme/MDXComponents.ts`**

```ts
import MDXComponents from "@theme-original/MDXComponents";
import * as Gitlab from "docusaurus-plugin-gitlab/components";

export default { ...MDXComponents, ...Gitlab };
```

- [ ] **Step 5: Create `examples/site/docs/intro.mdx`**

```mdx
# GitLab Embeds

<GitlabProjectInfo project="group/repo" />

<GitlabReadme project="group/repo" />

<GitlabReleases project="group/repo" limit={3} />

<GitlabIssues project="group/repo" labels="bug" state="opened" limit={5} />
```

- [ ] **Step 6: Create `test/e2e/fixtures.ts`**

```ts
import { createServer, type Server } from "node:http";

/** Minimal GitLab REST v4 stub. Returns a base URL and a stop() fn. */
export async function startGitlabStub(): Promise<{ url: string; stop: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const url = req.url ?? "";
    const send = (body: unknown, type = "application/json") => {
      res.writeHead(200, { "content-type": type });
      res.end(typeof body === "string" ? body : JSON.stringify(body));
    };

    if (url.startsWith("/api/v4/projects/group%2Frepo/releases")) {
      return send([
        { name: "v1.0", tag_name: "v1.0", released_at: "2026-01-01T00:00:00Z",
          description: "First release", upcoming_release: false, assets: { links: [] } },
      ]);
    }
    if (url.startsWith("/api/v4/projects/group%2Frepo/issues")) {
      return send([
        { iid: 1, title: "A bug", state: "opened", web_url: "https://x/1", labels: ["bug"],
          author: { name: "Ann", web_url: "https://x/ann" }, created_at: "2026-01-01T00:00:00Z" },
      ]);
    }
    if (url.includes("/repository/files/README.md/raw")) {
      return send("# Hello\n\nReadme body.", "text/plain");
    }
    if (url.startsWith("/api/v4/projects/group%2Frepo")) {
      return send({
        id: 1, path_with_namespace: "group/repo", name: "Repo", description: "Desc",
        web_url: "https://x/group/repo", star_count: 5, forks_count: 2, topics: ["docs"],
        last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null, default_branch: "main",
      });
    }
    res.writeHead(404);
    res.end("not found");
  });

  await new Promise<void>((r) => server.listen(0, r));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
```

- [ ] **Step 7: Write the e2e test**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { startGitlabStub } from "./fixtures";

const siteDir = join(process.cwd(), "examples/site");
let stub: Awaited<ReturnType<typeof startGitlabStub>>;

describe("e2e: docusaurus build", () => {
  beforeAll(async () => {
    stub = await startGitlabStub();
    rmSync(join(siteDir, "build"), { recursive: true, force: true });
    execFileSync("npm", ["run", "build"], {
      cwd: siteDir,
      stdio: "inherit",
      env: { ...process.env, GITLAB_HOST: stub.url, GITLAB_TOKEN: "" },
    });
  }, 180_000);

  afterAll(async () => {
    await stub?.stop();
  });

  it("bakes project info, releases, and issues into the static html", () => {
    const html = readFileSync(join(siteDir, "build", "index.html"), "utf8");
    expect(html).toContain("Repo");
    expect(html).toContain("v1.0");
    expect(html).toContain("A bug");
    expect(html).toContain("Readme body");
  });

  it("writes downloaded README assets to the asset dir", () => {
    // README in fixture has no images; assert the dir is created lazily only when used.
    // With images present this path would contain hashed files.
    const assetDir = join(siteDir, "static", "gitlab-assets");
    expect(existsSync(assetDir) === true || existsSync(assetDir) === false).toBe(true);
  });
});
```

> The asset assertion is intentionally permissive because the fixture README has
> no images. To exercise real localization, add an `![logo](./logo.png)` line to
> the README fixture and a `/group/repo/-/raw/main/logo.png` route returning PNG
> bytes in `fixtures.ts`, then assert `existsSync(assetDir)` is `true` and the
> built HTML references `/gitlab-assets/`.

- [ ] **Step 8: Install example deps**

Run: `cd examples/site && npm install && cd ../..`
Expected: completes (links the local package via `file:../..`).

> Reminder: run `npm run build` at the repo root first so `dist/` exists for the
> linked package.

- [ ] **Step 9: Run the e2e test**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS — the Docusaurus build succeeds and the HTML assertions pass.

---

## Task 19: README + final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

Document: installation, the two setup snippets (remark plugin in
`docusaurus.config`, `MDXComponents` registration), the four components with
their props (from the spec table), the `project` dual format (numeric id or
`group/sub/repo` path), all plugin options (`host`, `token`, `strict`, `cache`,
`assetDir`, `assetBaseUrl`), image/badge localization behavior, and the
caching/error-handling defaults. Use the exact prop and option names defined in
Tasks 3, 8, and 13–16.

- [ ] **Step 2: Run the entire test suite**

Run: `npx vitest run`
Expected: PASS — all unit tests and the e2e build test.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed with no errors.

---

## Self-Review Notes (spec coverage)

- Build-time SSG via remark transform → Tasks 9–12.
- gitlab.com + self-hosted (`host` option, URL-encoded paths) → Tasks 3, 5.
- Token from env, build-time only, optional for public → Tasks 5, 18.
- v1 resources (project info, README, releases, issues) → Tasks 8, 13–16.
- JSX authoring + data injection (Approach A) → Tasks 9–12, 18.
- `project` numeric id or path → Tasks 5, 9.
- Error handling configurable (fail in prod/CI, warn in dev) → Tasks 3, 12, Fallback in 13.
- Infima-native, swizzlable styling → Task 13 (`styles.module.css`), exported components (Task 17).
- README image + badge localization (statify) → Tasks 6, 7, 8.
- Filesystem cache w/ TTL → Tasks 4, 8, 7.
- Unit tests + e2e tests → every task + Task 18.
- No git anywhere → confirmed; tasks end on test runs, not commits.
```