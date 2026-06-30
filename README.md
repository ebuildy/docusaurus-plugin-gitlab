# @ebuildy/docusaurus-plugin-gitlab

Embed **GitLab** resources — project info, README, releases, issues, and any
file or code snippet — directly in your **Docusaurus 3** documentation using MDX
components.

All data is fetched **at build time** and baked into your static site. No API
tokens or network calls ever reach the browser, and pages stay fast.

- ✅ Works with **gitlab.com** and self-hosted GitLab (configurable host)
- ✅ Authenticated (private projects) or public, via a build-time token
- ✅ Five ready-to-use JSX components
- ✅ README images **and badges are downloaded and localized** (offline-safe, frozen at build time)
- ✅ On-disk caching, theme-aware (Infima) styling, graceful error fallbacks

> Requires Docusaurus **3.x** and Node **20, 22, or 24** (Docusaurus 3 itself
> needs Node 20+).

## Installation

```bash
npm install @ebuildy/docusaurus-plugin-gitlab
```

> **ESM-only.** This package ships as ES modules (all of its remark/rehype
> dependencies are ESM). Load it from an ESM config — `docusaurus.config.ts` or
> `docusaurus.config.mjs` (the examples below use `import`). If your site still
> uses a CommonJS `docusaurus.config.js` on **Node < 20.19**, either switch the
> config to ESM or load the plugin with `await import(...)`. On **Node 20.19+**
> (and 22+) CommonJS configs work too, since Node can `require()` ES modules
> natively.

## Setup

Two one-time steps in your Docusaurus site.

### 1. Register the remark plugin

In `docusaurus.config.js` (or `.ts`), add the remark plugin to your docs/blog
preset:

```js
import { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";

export default {
  presets: [
    [
      "classic",
      {
        docs: {
          remarkPlugins: [
            [
              remarkGitlab,
              {
                host: "https://gitlab.com",
                token: process.env.GITLAB_TOKEN, // optional for public projects
              },
            ],
          ],
        },
      },
    ],
  ],
};
```

### 2. Register the components

Make the components available in every `.mdx` page by swizzling `MDXComponents`.
Create `src/theme/MDXComponents.js`:

```js
import MDXComponents from "@theme-original/MDXComponents";
import * as Gitlab from "@ebuildy/docusaurus-plugin-gitlab/components";

export default { ...MDXComponents, ...Gitlab };
```

Now write the components in any `.mdx` page — no per-page imports needed.

## Components

The `project` prop accepts either a numeric ID (`project={12345}`) or the full
namespace path (`project="group/subgroup/repo"`).

### `<GitlabProjectInfo>`

A card with name, description, topics, stars/forks, and last activity.

```mdx
<GitlabProjectInfo project="group/repo" />
<GitlabProjectInfo project="group/repo" showStats={false} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `project` | string \| number | — | **Required.** Project path or ID |
| `showStats` | boolean | `true` | Show stars/forks/last-activity row |

### `<GitlabReadme>`

Renders a project's README as themed HTML. Images and badges are downloaded and
localized; links resolve back to GitLab.

```mdx
<GitlabReadme project="group/repo" />
<GitlabReadme project="group/repo" ref="develop" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `project` | string \| number | — | **Required.** |
| `ref` | string | default branch | Branch, tag, or commit SHA |
| `toc` | `"hidden" \| "inline" \| "sidebar"` | _auto_ | Where to render the table of contents |

> **Table of contents:** if the README contains a GitLab `[[_TOC_]]` marker on its
> own line, it is replaced at build time with a generated table of contents linking
> to the document's `h2`–`h5` headings (which receive slug `id`s). This also works
> for markdown embedded via `<GitlabFile>` and for release notes. The `toc` prop
> overrides this default: `toc="inline"` always renders the inline TOC (even without
> a marker); `toc="sidebar"` renders the README's headings in the page's native
> right-hand sidebar instead (merged with the page's own headings) and suppresses
> the inline TOC; `toc="hidden"` renders no TOC and strips any marker. Omitting `toc`
> keeps today's marker-driven behavior.
>
> ```mdx
> <GitlabReadme project="group/repo" toc="sidebar" />
> ```
>
> Note: in `sidebar` mode the README is injected as pre-rendered HTML, so
> Docusaurus' broken-anchor checker can't see its heading anchors — harmless at the
> default `onBrokenAnchors: "warn"` (build succeeds, links work), but would fail a
> build configured with `onBrokenAnchors: "throw"`.

<!-- -->

> **Alerts:** GitLab alert blockquotes are rendered as themed callouts. A blockquote
> whose first line is `> [!note]`, `> [!tip]`, `> [!important]`, `> [!caution]`, or
> `> [!warning]` becomes a `<div>` carrying both `gitlab-md-alert*` hook classes and
> the Docusaurus/Infima `alert alert--<variant>` classes (so it inherits theme colors).
> Type matching is case-insensitive; add text after the marker for a custom title, e.g.
> `> [!warning] Data deletion`. This also works for `<GitlabFile>` markdown and release notes.

### `<GitlabReleases>`

A list of releases with notes, dates, and asset links.

```mdx
<GitlabReleases project="group/repo" limit={5} />
<GitlabReleases project="group/repo" includePrereleases={true} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `project` | string \| number | — | **Required.** |
| `limit` | number | `10` | Max releases to show |
| `includePrereleases` | boolean | `false` | Include upcoming/pre-releases |

### `<GitlabIssues>`

A filtered list of issues.

```mdx
<GitlabIssues project="group/repo" labels="bug" state="opened" limit={10} />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `project` | string \| number | — | **Required.** |
| `state` | string | `opened` | `opened`, `closed`, or `all` |
| `labels` | string | — | Comma-separated label filter |
| `milestone` | string | — | Milestone title filter |
| `limit` | number | `20` | Max issues to show |

### `<GitlabFile>`

Embed **any** file from a repository. Markdown files (`.md`/`.mdx`) render as
HTML (with image localization, like the README); any other file renders as a
syntax-highlighted code block (via `prism-react-renderer`).

```mdx
<GitlabFile project="group/repo" path="docs/architecture.md" />
<GitlabFile project="group/repo" path="src/main.ts" />
<GitlabFile project="group/repo" path="src/main.ts" lines="10-25" />
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `project` | string \| number | — | **Required.** |
| `path` | string | — | **Required.** File path within the repo |
| `ref` | string | default branch | Branch, tag, or commit SHA |
| `lines` | string | whole file | Line range for code files, e.g. `"10-25"` (1-based, inclusive) |

## Include placeholders

Besides the JSX components, you can embed GitLab **markdown** and **files** with
text placeholders that are substituted **before** MDX parsing — so the content
flows through Docusaurus's own pipeline (table of contents, emoji, admonitions,
heading anchors, Prism highlighting, internal links) exactly as if you had written
it by hand.

### Setup

Register the plugin once. This is separate from the remark plugin in
[Setup](#setup) above — keep that for the JSX components:

```ts
// docusaurus.config.ts (ESM)
import gitlabPlugin from "@ebuildy/docusaurus-plugin-gitlab";

export default {
  plugins: [
    [
      gitlabPlugin,
      {
        host: "https://gitlab.com",
        token: process.env.GITLAB_TOKEN, // optional for public projects
      },
    ],
  ],
  // ...your presets, including remarkGitlab for the JSX components...
};
```

The plugin also contributes `theme.css` automatically (via `getClientModules`),
so the component/include styles load without a separate `customCss` entry.

### Syntax

| Placeholder | Effect |
|---|---|
| `{@includeGitlabReadme: group/sub/project}` | Inline the project README (default branch) |
| `{@includeGitlabReadme: ref@group/sub/project}` | …at a branch, tag, or commit SHA |
| `{@includeGitlabFile: group/sub/project/-/path/file.md}` | Inline a markdown file as markdown |
| `{@includeGitlabFile: ref@group/sub/project/-/src/app.ts#L10-25}` | Inline a code file as a highlighted block (optional line range) |

- The project path and the file path are separated by `/-/` — the same separator
  GitLab uses in its URLs — which keeps nested subgroups unambiguous.
- A leading `ref@` pins the content to a branch, tag, or commit SHA.
- `{@includeGitlabFile}` decides by extension: `.md`/`.mdx`/`.markdown` are inlined
  as markdown; everything else becomes a fenced, syntax-highlighted code block, with
  an optional `#Lstart-end` line range (1-based, inclusive).
- Images are downloaded and localized, and repo-relative links are rewritten to
  absolute GitLab URLs — same as `<GitlabReadme>`.
- Because the content becomes part of your page's markdown source, MDX-significant
  characters in the remote content are escaped so a stray `{` or `<` can't break your
  build. Code blocks are left verbatim.

> **Placeholders vs. components:** reach for the placeholders when you want GitLab
> markdown to render through Docusaurus's native pipeline (TOC, emoji, admonitions,
> highlighting). Reach for `<GitlabReadme>` / `<GitlabFile>` when you want a
> self-contained, pre-rendered HTML block. Both can coexist in the same site.

### Post-processing the generated markdown

GitLab markdown sometimes uses constructs that are valid CommonMark but **not**
valid MDX. Two built-in processors fix the common ones (both **on by default**):

- **`fixAutolinks`** — rewrites CommonMark autolinks like `<https://example.com>`
  or `<contact@example.com>` (which MDX reads as JSX tags) into normal markdown
  links (`[contact@example.com](mailto:contact@example.com)`). Disable with
  `fixAutolinks: false`.
- **`fixVoidTags`** — self-closes HTML void elements like `<br>` or `<img …>`
  (which MDX rejects with _"Expected a closing tag for `<br>`"_) into `<br/>`.
  Disable with `fixVoidTags: false`.

Optionally, **`stripToc`** (default **off**) removes a README's own "Table of
Contents" section (the heading plus its list, up to the next heading of the same or
higher level) and any `[[_TOC_]]` marker — Docusaurus already renders a TOC in the
right sidebar. Enable with `stripToc: true`.

Add your own transforms with `outProcessors` — each receives the generated markdown
of a markdown include (after the built-in fixes) and returns the new markdown:

```ts
import gitlabPlugin, { fixAutolinks } from "@ebuildy/docusaurus-plugin-gitlab";

plugins: [
  [
    gitlabPlugin,
    {
      host: "https://gitlab.com",
      // fixAutolinks: false,            // opt out of the built-in
      outProcessors: [
        (md) => md.replace(/:tada:/g, "🎉"), // runs after fixAutolinks
      ],
    },
  ],
];
```

`outProcessors` receive the whole generated markdown string (sync or async) and run
only on markdown includes (not on code-file fences). Fenced/inline code is the
caller's responsibility to preserve; the built-in `fixAutolinks` already skips it.

## Plugin options

| Option | Type | Default | Description |
|---|---|---|---|
| `host` | string | — | **Required.** GitLab base URL (e.g. `https://gitlab.com`) |
| `token` | string | — | Personal/Project Access Token. Optional for public reads. Build-time only |
| `strict` | boolean | `true` in prod, `false` in dev | On a failed fetch: `true` aborts the build; `false` renders a fallback |
| `cache` | `{ ttl: number }` \| `false` | `{ ttl: 3600 }` | On-disk cache TTL (seconds), or `false` to disable |
| `assetDir` | string | `static/gitlab-assets` | Where README images/badges are downloaded |
| `assetBaseUrl` | string | `/gitlab-assets` | URL path the downloaded assets are served from |
| `fixAutolinks` | boolean | `true` | Rewrite CommonMark autolinks in included markdown to MDX-safe links (include placeholders only) |
| `fixVoidTags` | boolean | `true` | Self-close HTML void elements (`<br>` → `<br/>`) in included markdown (include placeholders only) |
| `stripToc` | boolean | `false` | Remove a redundant "Table of Contents" section (and `[[_TOC_]]` marker) from included markdown |
| `outProcessors` | `Array<(md: string) => string \| Promise<string>>` | `[]` | Extra post-processors for included markdown, run after the built-in fixes |

The token is read at build time only. Provide it via an environment variable
(`GITLAB_TOKEN`) — never commit it.

## How it works

A remark plugin walks the MDX syntax tree during `docusaurus build`, finds the
`<Gitlab*>` elements, fetches the needed data from GitLab's REST API (via
[`@gitbeaker/rest`](https://github.com/jdalrymple/gitbeaker)), downloads any
README images/badges into your static assets, and injects the result as a prop.
The React components are pure presentational renderers of that prop. Results are
cached on disk so local `docusaurus start` hot-reloads don't hammer the API.

Because everything happens at build time, your published HTML is self-contained:
no tokens shipped, no client-side API calls, no CORS.

## Styling

The components ship **without any bundled CSS** — they render plain, stable class
names so you stay in full control of the look. The package includes an optional,
light/dark-aware theme (`theme.css`) you can apply as-is or use as a starting
point. It's built on [Infima](https://infima.dev/) variables, so it tracks your
site's active theme automatically.

Apply it from your `classic` preset's `theme.customCss`:

```ts
// docusaurus.config.ts (ESM)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

// ...inside the classic preset options:
theme: {
  customCss: require.resolve("@ebuildy/docusaurus-plugin-gitlab/theme.css"),
},
```

Prefer to own the CSS? Copy
[`theme.css`](https://github.com/ebuildy/docusaurus-plugin-gitlab/blob/main/theme.css)
into your `src/css/custom.css` and edit freely. The class names you can target:

| Class | Element |
|---|---|
| `gitlab-card` | `<GitlabProjectInfo>` container |
| `gitlab-card-header` | avatar + title row |
| `gitlab-avatar` | project avatar image |
| `gitlab-title` | project / release title |
| `gitlab-muted` | secondary text (dates, authors, descriptions) |
| `gitlab-badge` | topics, tags, labels, release assets |
| `gitlab-stats` | stars / forks / updated row |
| `gitlab-issues` / `gitlab-issue` | issues list + each issue row |
| `gitlab-issue-state` / `gitlab-issue-title` | issue state badge (`data-state`) + title link |
| `gitlab-releases` / `gitlab-release` | releases list + each release card |
| `gitlab-release-notes` / `gitlab-release-assets` | release body + asset links |
| `gitlab-readme` | rendered README / markdown file |
| `gitlab-md-toc` | generated `[[_TOC_]]` table of contents (`<nav>`) |
| `gitlab-md-alert` / `gitlab-md-alert--<type>` | alert callout container + per-type modifier (also gets Infima `alert alert--<variant>`) |
| `gitlab-md-alert-title` | alert title row |
| `gitlab-fallback` | error fallback box |
| `gitlab-code` / `gitlab-code-title` / `gitlab-code-pre` | code file embed |

## Development

```bash
npm install
npm run build       # compile with tsc (ESM-only + types)
npm run test        # unit tests (Vitest)
npm run typecheck   # tsc --noEmit
```

The `examples/site/` directory contains a minimal Docusaurus 3 site used by the
end-to-end test (`test/e2e/build.test.ts`), which builds the site against a
mocked GitLab API and asserts the embeds are baked into the HTML.

## License

MIT
