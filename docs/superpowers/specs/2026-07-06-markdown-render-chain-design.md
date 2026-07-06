# Configurable markdown render chain — design

- **Status:** approved (brainstorm), pending implementation plan
- **Date:** 2026-07-06
- **Package:** `@ebuildy/docusaurus-plugin-gitlab`

## Problem

All GitLab markdown (project descriptions, release notes, READMEs, and markdown
files) is rendered at build time by a single hardcoded `unified()` pipeline in
`src/gitlab/markdown.ts`:

```text
remarkParse → remarkGemoji → remarkGfm → remarkRehype({ allowDangerousHtml })
  → rehypeRaw → rehypeSanitize
  → rehypeGitlabToc → rehypeGitlabAlerts → collect → rehypeStringify
```

Users cannot influence this chain. They cannot add remark/rehype plugins they
need — syntax highlighting (`rehype-highlight`), math (`remark-math` +
`rehype-katex`), custom directives, etc. — nor swap the defaults. The chain is
closed.

We want to let users configure the markdown-rendering plugin chain via a single
plugin option, defaulting to the current chain.

## Scope

**In scope:** a single `markdownRenderChain` plugin option that replaces the
**configurable prefix** of the pipeline (`remarkParse … rehypeSanitize`),
defaulting to the current six plugins. Applies to every `renderMarkdown` call
site (description, releases, README, file).

**Out of scope:** the internal stages that run *after* the configurable prefix —
`rehypeGitlabToc`, `rehypeGitlabAlerts`, the image/link `collect` visitor, and
`rehypeStringify`. These consume runtime values (`tocMode`, the collected TOC
array, the per-fetch asset-transform closures) and cannot be expressed as static
configuration, so they remain appended by the plugin and are not user-facing.

## Design

### Config surface — `src/options.ts`

Add one optional option to both `PluginOptions` and `ResolvedOptions`:

```ts
import type { PluggableList } from "unified"; // type-only import

markdownRenderChain?: PluggableList;
```

`PluggableList` means each entry is a plugin function or a `[plugin, options]`
tuple — the same shape unified's `.use()` accepts. Joi validation mirrors the
existing `outProcessors` precedent:

```ts
markdownRenderChain: Joi.array()
  .items(Joi.alternatives(Joi.function(), Joi.array()))
  .optional(),
```

`resolveOptions` passes the value through **as-is** (it may be `undefined`); the
default is *not* materialized here. This keeps `options.ts` free of runtime
plugin imports — it only needs the type-only `PluggableList` import.

### Chain ownership — `src/gitlab/markdown.ts`

`markdown.ts` owns the default chain and the fallback:

- Export the default so users can spread it:

  ```ts
  export const defaultMarkdownRenderChain: PluggableList = [
    remarkParse,
    remarkGemoji,
    remarkGfm,
    [remarkRehype, { allowDangerousHtml: true }],
    rehypeRaw,
    rehypeSanitize,
  ];
  ```

  Usage: `markdownRenderChain: [...defaultMarkdownRenderChain, myPlugin]`.

- `RenderOptions` gains `renderChain?: PluggableList`.

- The processor is built from the configured chain (or the default), then the
  fixed internal stages are appended:

  ```ts
  const processor = unified()
    .use(opts.renderChain ?? defaultMarkdownRenderChain)
    .use(rehypeGitlabToc, { mode: opts.tocMode ?? "auto", collect: opts.collectToc })
    .use(rehypeGitlabAlerts)
    .use(collect)
    .use(rehypeStringify);
  ```

- Export a helper for the sanitize check:

  ```ts
  export function chainHasSanitize(chain: PluggableList): boolean;
  ```

  It returns true when any entry (function, or `entry[0]` of a tuple) is
  `rehypeSanitize` by reference **or** by function name `"rehypeSanitize"`.

### Threading — `src/gitlab/context.ts` + `src/gitlab/fetchers.ts`

`buildContext` copies `options.markdownRenderChain` onto `ctx.options`. The
`GitLabContext.options` type gains an optional `markdownRenderChain?:
PluggableList`. Each of the four `renderMarkdown` calls in `fetchers.ts` passes
`renderChain: ctx.options.markdownRenderChain` alongside their existing options.

### Sanitize warning — `src/gitlab/context.ts`

The security check runs **once per build**, in `buildContext` (not per document,
which would spam). When `markdownRenderChain` is set and
`!chainHasSanitize(markdownRenderChain)`:

```ts
logger.warn(
  "@ebuildy/docusaurus-plugin-gitlab: markdownRenderChain has no rehype-sanitize — " +
  "untrusted GitLab content will be rendered without sanitization."
);
```

via `@docusaurus/logger`. The chain is used exactly as given (full control); the
warning is advisory only and does not abort the build.

## Security invariant

The default chain is unchanged, so the default behavior still runs
`rehype-raw` **before** `rehype-sanitize`. The existing XSS regression test in
`src/gitlab/markdown.test.ts` exercises the default chain and stays green,
untouched.

A user who overrides `markdownRenderChain` takes ownership of sanitization.
Omitting `rehype-sanitize` is permitted (per product decision) but produces a
build-time warning. This is a deliberate, documented relaxation of the
CLAUDE.md "rehype-raw before rehype-sanitize" rule: the rule remains the default
and is enforced by the shipped default chain; only an explicit user override can
step outside it, and doing so is surfaced loudly.

## Testing

- **Existing XSS regression test** — unchanged; exercises the default chain.
- **Custom chain transforms output** — a `renderChain` with an extra plugin
  produces the expected transformed HTML.
- **Full override works** — a `renderChain` omitting `rehype-sanitize` lets raw
  HTML through (proves the chain is used verbatim, not merely appended to).
- **`chainHasSanitize`** — true for chains containing `rehypeSanitize` (bare and
  as a `[plugin, opts]` tuple), false otherwise.
- **`buildContext` warns** — when the configured chain lacks sanitize, the logger
  is called; no warning when sanitize is present or when the option is unset
  (mock `@docusaurus/logger`).
- **Options** — Joi accepts `markdownRenderChain`; `resolveOptions` round-trips
  it (including `undefined` → passed through).

## Docs

README gains a `markdownRenderChain` section: the default chain, the
`[...defaultMarkdownRenderChain, …]` spread pattern, an example (e.g. adding
`rehype-highlight`), and the security caveat that omitting `rehype-sanitize`
disables sanitization of untrusted GitLab content.
