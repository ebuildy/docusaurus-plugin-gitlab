# Card UI theme + project avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable, light/dark-aware "minimal but beautiful" card theme (one boolean plugin option) and show the project avatar in the project-overview card.

**Architecture:** A new Docusaurus plugin injects one inline `<style>` that defines private `--gl-card-*` CSS variables on `:root` (plus a `[data-theme='dark']` override). The components' CSS module reads those variables with fallbacks equal to today's look, so `theme: false` is visually unchanged and dark mode rides on Docusaurus's existing `data-theme` attribute. Separately, `fetchProjectInfo` localizes the project avatar via the existing `AssetManager`, and `GitlabProjectInfo` renders it.

**Tech Stack:** TypeScript (ESM-only, `.js` import extensions), Joi (validation), Vitest + React Testing Library, tsup. Spec: `docs/superpowers/specs/2026-06-28-card-theme-design.md`.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/plugin/theme.ts` (new) | `resolveTheme(input)` (Joi validate + default), `renderThemeCss()` (pure CSS string), `GL_CARD_VARS` (the var-name list — single source of truth). |
| `src/plugin/theme.test.ts` (new) | Unit tests for `resolveTheme` / `renderThemeCss` + the CSS-module sync guard. |
| `src/plugin/index.ts` (new) | Docusaurus plugin `docusaurusGitlabTheme(context, options)` → `injectHtmlTags()`. |
| `src/plugin/index.test.ts` (new) | Unit tests for `injectHtmlTags` (enabled vs disabled). |
| `src/components/styles.module.css` (modify) | Read `var(--gl-card-*, <current value>)` so fallbacks reproduce today's look; add subtle hover + avatar class. |
| `package.json` (modify) | Add `./plugin` export subpath. |
| `tsup.config.ts` (modify) | Add `src/plugin/index.ts` entry. |
| `test/packaging.test.ts` (modify) | Add `./plugin` to the guarded subpaths. |
| `src/gitlab/fetchers.ts` (modify) | `fetchProjectInfo`: localize `p.avatar_url` when present. |
| `src/gitlab/fetchers.test.ts` (modify) | Tests for avatar localization (present / null). |
| `src/components/GitlabProjectInfo.tsx` (modify) | Render rounded avatar `<img>` when `avatarUrl` set. |
| `src/components/GitlabProjectInfo.test.tsx` (modify) | Tests for avatar render (present / null). |
| `examples/site/docusaurus.config.ts` (modify) | Register the plugin in `plugins: []`. |
| `README.md` (modify) | Document the card theme option. |

---

## Task 1: Theme CSS builder (`src/plugin/theme.ts`)

**Files:**
- Create: `src/plugin/theme.ts`
- Test: `src/plugin/theme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugin/theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveTheme, renderThemeCss, GL_CARD_VARS } from "./theme.js";

describe("resolveTheme", () => {
  it("defaults to enabled when no option is given", () => {
    expect(resolveTheme(undefined)).toEqual({ enabled: true });
    expect(resolveTheme({})).toEqual({ enabled: true });
  });

  it("respects theme: false", () => {
    expect(resolveTheme({ theme: false })).toEqual({ enabled: false });
  });

  it("throws on a non-boolean theme", () => {
    expect(() => resolveTheme({ theme: "yes" as any })).toThrow(
      /@ebuildy\/docusaurus-plugin-gitlab/,
    );
  });

  it("throws on unknown keys", () => {
    expect(() => resolveTheme({ accent: "#fff" } as any)).toThrow(
      /@ebuildy\/docusaurus-plugin-gitlab/,
    );
  });
});

describe("renderThemeCss", () => {
  const css = renderThemeCss();

  it("defines every --gl-card-* var on :root", () => {
    expect(css).toMatch(/:root\s*\{/);
    for (const v of GL_CARD_VARS) {
      expect(css, `missing ${v}`).toContain(`${v}:`);
    }
  });

  it("references --ifm-* theme variables for colors", () => {
    expect(css).toContain("var(--ifm-color-primary)");
    expect(css).toContain("var(--ifm-background-surface-color)");
  });

  it("includes a dark-mode override block", () => {
    expect(css).toContain("[data-theme='dark']");
  });

  it("uses no hardcoded hex palette colors", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("CSS module stays in sync with the theme vars", () => {
  it("references every --gl-card-* var", () => {
    const cssPath = fileURLToPath(
      new URL("../components/styles.module.css", import.meta.url),
    );
    const moduleCss = readFileSync(cssPath, "utf8");
    for (const v of GL_CARD_VARS) {
      expect(moduleCss, `styles.module.css does not use ${v}`).toContain(v);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/plugin/theme.test.ts`
Expected: FAIL — cannot resolve `./theme.js` (module does not exist).

- [ ] **Step 3: Write the implementation**

Create `src/plugin/theme.ts`:

```ts
import Joi from "joi";

export interface GitlabThemeOptions {
  /** Inject the polished card theme. Default: true. */
  theme?: boolean;
}

export interface ResolvedTheme {
  enabled: boolean;
}

/** Private CSS variables the theme defines and the component CSS consumes. */
export const GL_CARD_VARS = [
  "--gl-card-bg",
  "--gl-card-border",
  "--gl-card-radius",
  "--gl-card-shadow",
  "--gl-card-accent",
  "--gl-card-badge-bg",
] as const;

const schema = Joi.object({
  theme: Joi.boolean().optional(),
});

export function resolveTheme(input: GitlabThemeOptions | undefined): ResolvedTheme {
  const { error, value } = schema.validate(input ?? {}, { abortEarly: false });
  if (error) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: invalid theme options — ${error.message}`,
    );
  }
  return { enabled: (value as GitlabThemeOptions).theme ?? true };
}

export function renderThemeCss(): string {
  return `:root {
  --gl-card-bg: var(--ifm-background-surface-color);
  --gl-card-border: var(--ifm-color-emphasis-200);
  --gl-card-radius: 10px;
  --gl-card-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 2px 8px rgb(0 0 0 / 0.04);
  --gl-card-accent: var(--ifm-color-primary);
  --gl-card-badge-bg: var(--ifm-color-emphasis-100);
}
[data-theme='dark'] {
  --gl-card-border: var(--ifm-color-emphasis-300);
  --gl-card-shadow: 0 1px 2px rgb(0 0 0 / 0.3), 0 2px 10px rgb(0 0 0 / 0.25);
}
`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/plugin/theme.test.ts`
Expected: PASS for `resolveTheme` and `renderThemeCss` groups. The "CSS module stays in sync" test will still FAIL (the module does not reference the vars yet) — that is fixed in Task 3. To confirm only the sync test fails here, the failure message must be `styles.module.css does not use --gl-card-...`.

- [ ] **Step 5: Commit**

```bash
git add src/plugin/theme.ts src/plugin/theme.test.ts
git commit -m "feat: add card theme CSS builder and option validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Docusaurus plugin (`src/plugin/index.ts`)

**Files:**
- Create: `src/plugin/index.ts`
- Test: `src/plugin/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/plugin/index.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import docusaurusGitlabTheme from "./index.js";

const ctx = {} as any;

describe("docusaurusGitlabTheme", () => {
  it("has the package name", () => {
    const plugin = docusaurusGitlabTheme(ctx, {});
    expect(plugin.name).toBe("docusaurus-plugin-gitlab-theme");
  });

  it("injects a style tag with the card vars when enabled", () => {
    const plugin = docusaurusGitlabTheme(ctx, { theme: true });
    const tags = plugin.injectHtmlTags!({ content: undefined });
    const head = (tags.headTags ?? []) as any[];
    expect(head).toHaveLength(1);
    expect(head[0].tagName).toBe("style");
    expect(head[0].innerHTML).toContain("--gl-card-shadow");
    expect(head[0].innerHTML).toContain("[data-theme='dark']");
  });

  it("injects nothing when theme is false", () => {
    const plugin = docusaurusGitlabTheme(ctx, { theme: false });
    const tags = plugin.injectHtmlTags!({ content: undefined });
    expect(tags.headTags ?? []).toHaveLength(0);
  });

  it("throws on invalid options", () => {
    expect(() => docusaurusGitlabTheme(ctx, { theme: "x" } as any)).toThrow(
      /@ebuildy\/docusaurus-plugin-gitlab/,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/plugin/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Write the implementation**

Create `src/plugin/index.ts`. We define minimal local types instead of depending on `@docusaurus/types` (not a dependency of this package):

```ts
import { resolveTheme, renderThemeCss, type GitlabThemeOptions } from "./theme.js";

interface HtmlTagObject {
  tagName: string;
  attributes?: Record<string, string | boolean>;
  innerHTML?: string;
}

interface InjectedHtmlTags {
  headTags?: HtmlTagObject[];
}

interface GitlabThemePlugin {
  name: string;
  injectHtmlTags(args: { content: unknown }): InjectedHtmlTags;
}

export default function docusaurusGitlabTheme(
  _context: unknown,
  options: GitlabThemeOptions,
): GitlabThemePlugin {
  const { enabled } = resolveTheme(options);
  return {
    name: "docusaurus-plugin-gitlab-theme",
    injectHtmlTags() {
      if (!enabled) return {};
      return {
        headTags: [
          {
            tagName: "style",
            attributes: { type: "text/css" },
            innerHTML: renderThemeCss(),
          },
        ],
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/plugin/index.test.ts`
Expected: PASS (all four tests).

- [ ] **Step 5: Commit**

```bash
git add src/plugin/index.ts src/plugin/index.test.ts
git commit -m "feat: add docusaurus plugin that injects the card theme

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Consume the vars in the component CSS

**Files:**
- Modify: `src/components/styles.module.css`

This makes the Task 1 "CSS module stays in sync" test pass, keeps `theme: false` visually identical to today (fallbacks = current values), and adds the subtle hover and the avatar class.

- [ ] **Step 1: Edit the CSS module**

Replace the contents of `src/components/styles.module.css` with:

```css
.card {
  border: 1px solid var(--gl-card-border, var(--ifm-color-emphasis-300));
  border-radius: var(--gl-card-radius, var(--ifm-card-border-radius, 8px));
  padding: 1rem;
  margin: 1rem 0;
  background: var(--gl-card-bg, var(--ifm-card-background-color, var(--ifm-background-surface-color)));
  box-shadow: var(--gl-card-shadow, none);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.card:hover {
  border-color: var(--gl-card-accent, var(--ifm-color-emphasis-300));
}
.header { display: flex; align-items: center; gap: 0.6rem; }
.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--gl-card-radius, 8px);
  object-fit: cover;
  flex: none;
}
.title { font-weight: 600; }
.title a { color: var(--gl-card-accent, inherit); }
.muted { color: var(--ifm-color-emphasis-600); }
.stats { display: flex; gap: 1rem; margin-top: 0.5rem; }
.badge {
  display: inline-block;
  padding: 0 0.5rem;
  border-radius: 4px;
  background: var(--gl-card-badge-bg, var(--ifm-color-emphasis-200));
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
.codeBlock {
  margin: 1rem 0;
  border: 1px solid var(--gl-card-border, var(--ifm-color-emphasis-300));
  border-radius: var(--gl-card-radius, var(--ifm-code-border-radius, 6px));
  overflow: hidden;
}
.codeTitle {
  padding: 0.4rem 1rem;
  font-size: 0.85em;
  font-family: var(--ifm-font-family-monospace);
  color: var(--ifm-color-emphasis-700);
  background: var(--ifm-color-emphasis-100);
  border-bottom: 1px solid var(--gl-card-border, var(--ifm-color-emphasis-300));
}
.codePre {
  margin: 0;
  padding: 1rem;
  overflow: auto;
  font-size: var(--ifm-code-font-size, 90%);
}
```

- [ ] **Step 2: Run the theme test to verify the sync guard passes**

Run: `npx vitest run src/plugin/theme.test.ts`
Expected: PASS (all groups now, including "CSS module stays in sync").

- [ ] **Step 3: Commit**

```bash
git add src/components/styles.module.css
git commit -m "feat: drive card styles from --gl-card-* theme variables

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Ship the `/plugin` export

**Files:**
- Modify: `package.json`
- Modify: `tsup.config.ts`
- Modify: `test/packaging.test.ts`

- [ ] **Step 1: Add `./plugin` to the packaging guard test**

In `test/packaging.test.ts`, change the `subpaths` line (currently line 24):

```ts
  const subpaths = [".", "./remark", "./components", "./plugin"];
```

- [ ] **Step 2: Run the packaging test to verify it fails**

Run: `npx vitest run test/packaging.test.ts`
Expected: FAIL — `missing export "./plugin"`.

- [ ] **Step 3: Add the export to `package.json`**

In `package.json`, inside `"exports"`, after the `"./components"` block, add:

```json
    "./plugin": {
      "types": "./dist/plugin/index.d.ts",
      "import": "./dist/plugin/index.js",
      "default": "./dist/plugin/index.js"
    }
```

(Add a comma after the preceding `"./components"` block so the JSON stays valid.)

- [ ] **Step 4: Add the tsup entry**

In `tsup.config.ts`, update the `entry` array:

```ts
  entry: ["src/index.ts", "src/remark/index.ts", "src/components/index.ts", "src/plugin/index.ts"],
```

- [ ] **Step 5: Run the packaging test to verify it passes**

Run: `npx vitest run test/packaging.test.ts`
Expected: PASS.

- [ ] **Step 6: Build to confirm the entry compiles**

Run: `npm run build`
Expected: tsup emits `dist/plugin/index.js` and `dist/plugin/index.d.ts` with no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsup.config.ts test/packaging.test.ts
git commit -m "build: expose @ebuildy/docusaurus-plugin-gitlab/plugin entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Localize the project avatar in the fetcher

**Files:**
- Modify: `src/gitlab/fetchers.ts` (`fetchProjectInfo`, around lines 30-47)
- Test: `src/gitlab/fetchers.test.ts` (`fetchProjectInfo` describe block, lines 18-30)

- [ ] **Step 1: Write the failing tests**

In `src/gitlab/fetchers.test.ts`, replace the existing `describe("fetchProjectInfo", ...)` block (lines 18-30) with:

```ts
describe("fetchProjectInfo", () => {
  it("normalizes the project payload", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: ["x"], last_activity_at: "2026-01-01T00:00:00Z", avatar_url: null,
      })),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(data).toMatchObject({ id: 7, path: "g/r", starCount: 3, topics: ["x"] });
    expect(data.avatarUrl).toBeNull();
    expect(c.assets.localize).not.toHaveBeenCalled();
    expect(client.getProject).toHaveBeenCalledWith("g/r");
  });

  it("localizes the avatar when the project has one", async () => {
    const client = {
      getProject: vi.fn(async () => ({
        id: 7, path_with_namespace: "g/r", name: "r", description: "d", web_url: "https://gitlab.com/g/r",
        star_count: 3, forks_count: 1, topics: ["x"], last_activity_at: "2026-01-01T00:00:00Z",
        avatar_url: "https://gitlab.com/uploads/avatar.png",
      })),
    };
    const c = ctx(client);
    const data = await fetchProjectInfo(c, { project: "g/r" });
    expect(c.assets.localize).toHaveBeenCalledWith("https://gitlab.com/uploads/avatar.png", "", "g/r");
    expect(data.avatarUrl).toBe("/gitlab-assets/httpsgitlabcomuploadsavatarpng.png");
  });
});
```

(The expected localized string matches the fake `localize` in `ctx()`: `` `/gitlab-assets/${src.replace(/\W/g, "")}.png` ``.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t fetchProjectInfo`
Expected: FAIL — `localize` not called / `avatarUrl` is the raw remote URL.

- [ ] **Step 3: Update `fetchProjectInfo`**

In `src/gitlab/fetchers.ts`, replace the body of the `memo(...)` callback in `fetchProjectInfo` (lines 32-46) so the avatar is localized:

```ts
  return memo(ctx, `projectInfo:${project}`, async () => {
    const p = await ctx.client.getProject(attrs.project as string | number);
    const avatarUrl = p.avatar_url
      ? await ctx.assets.localize(p.avatar_url, "", project)
      : null;
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
      avatarUrl,
    } satisfies ProjectInfoData;
  }).then((v) => ({ ...v, path: v.path || project }));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/gitlab/fetchers.test.ts -t fetchProjectInfo`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/gitlab/fetchers.ts src/gitlab/fetchers.test.ts
git commit -m "feat: localize project avatar at build time

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Render the avatar in `GitlabProjectInfo`

**Files:**
- Modify: `src/components/GitlabProjectInfo.tsx`
- Test: `src/components/GitlabProjectInfo.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `src/components/GitlabProjectInfo.test.tsx`, add these two tests inside the existing `describe("GitlabProjectInfo", ...)` block (after the existing tests):

```ts
  it("renders the avatar when avatarUrl is set", () => {
    render(<GitlabProjectInfo data={{ ...data, avatarUrl: "/gitlab-assets/a.png" } as any} />);
    const img = screen.getByRole("img", { name: "My Repo" });
    expect(img).toHaveAttribute("src", "/gitlab-assets/a.png");
  });

  it("renders no avatar when avatarUrl is null", () => {
    render(<GitlabProjectInfo data={data as any} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx`
Expected: FAIL — no `img` is rendered.

- [ ] **Step 3: Update the component**

Replace the `return (...)` JSX in `src/components/GitlabProjectInfo.tsx` so the title sits in a header row with the optional avatar:

```tsx
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        {data.avatarUrl && (
          <img
            className={styles.avatar}
            src={data.avatarUrl}
            alt={data.name}
            width={32}
            height={32}
          />
        )}
        <div className={styles.title}>
          <a href={data.webUrl}>{data.name}</a>
        </div>
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/GitlabProjectInfo.test.tsx`
Expected: PASS (all four tests, including the original name/description/stats and fallback tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/GitlabProjectInfo.tsx src/components/GitlabProjectInfo.test.tsx
git commit -m "feat: show project avatar in GitlabProjectInfo

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Wire the example site, document, and verify

**Files:**
- Modify: `examples/site/docusaurus.config.ts`
- Modify: `README.md`

- [ ] **Step 1: Register the plugin in the example site**

In `examples/site/docusaurus.config.ts`, add the import near the top (after the existing `remarkGitlab` import):

```ts
import docusaurusGitlabTheme from "@ebuildy/docusaurus-plugin-gitlab/plugin";
```

Then add a top-level `plugins` array to the `config` object (sibling of `presets`):

```ts
  plugins: [[docusaurusGitlabTheme, { theme: true }]],
```

- [ ] **Step 2: Document the option in the README**

Add a "Card theme" section to `README.md` (place it after the existing setup/usage section). Use this content:

```markdown
## Card theme

The package ships an optional Docusaurus plugin that styles the embedded GitLab
cards with a minimal, light/dark-aware theme. Register it in `plugins`:

```ts
import docusaurusGitlabTheme from "@ebuildy/docusaurus-plugin-gitlab/plugin";

// docusaurus.config.ts
plugins: [[docusaurusGitlabTheme, { theme: true }]],
```

`theme` defaults to `true`. Set it to `false` to opt out and keep the plain
fallback styling. The theme follows your site's active light/dark mode — it reads
Docusaurus's own `--ifm-*` variables and ships no client-side JavaScript.
```

(Note: the inner code fence above is part of the README content — keep it as a nested fenced block.)

- [ ] **Step 3: Typecheck the package**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full unit test suite**

Run: `npx vitest run`
Expected: all tests pass (excludes the slow e2e, which is run next).

- [ ] **Step 5: Run the e2e build (slow, ~1 min)**

Run: `npx vitest run test/e2e/build.test.ts`
Expected: PASS — the example site (now registering the theme plugin) builds successfully.

- [ ] **Step 6: Commit**

```bash
git add examples/site/docusaurus.config.ts README.md
git commit -m "docs: wire and document the card theme plugin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run `npx vitest run` — all unit tests green.
- [ ] Run `npm run typecheck` — clean.
- [ ] Run `npm run build` — `dist/plugin/index.js` + `.d.ts` emitted.
- [ ] Run `npx vitest run test/e2e/build.test.ts` — e2e build green.
```
