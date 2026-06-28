# Card UI theme + project avatar — design

## Goal

Ship a small, opinionated "minimal but beautiful" card theme for the
`@ebuildy/docusaurus-plugin-gitlab` components. It must be:

- **Toggleable from plugin config** with a single boolean — no token tuning.
- **Light/dark aware**, following the host site's active Docusaurus theme.
- **Pure CSS / SSR-safe** — no client JS, no flash, consistent with the
  build-time / static-HTML philosophy in `CLAUDE.md`.

## Non-goals

- No configurable design tokens (accent, radius, elevation, density). Explicitly
  cut — the theme is one opinionated look.
- No `{ light, dark }` config pairs and no `--gl-card-*` token system.
- No changes to the component `.tsx` files or their class names *for theming*
  (the avatar addition below does touch `GitlabProjectInfo.tsx`).
- No automatic MDX component registration (users still register components via
  `MDXComponents` as today).
- No *user-facing* design tokens. The internal `--gl-card-*` CSS variables below
  are private plumbing, not config — the user only ever sets the boolean.

## Approach

Add a **Docusaurus plugin** alongside the existing remark plugin. The components'
CSS module is rewritten so each visual property reads a private internal variable
with a built-in fallback, e.g.
`box-shadow: var(--gl-card-shadow, none)` and
`border-color: var(--gl-card-border, var(--ifm-color-emphasis-300))`. The
fallback values reproduce today's bare look, so with no plugin the cards look
exactly as they do now.

When the plugin is enabled it injects a single inline `<style>` into `<head>`
(via `injectHtmlTags`) that **defines those `--gl-card-*` variables on `:root`**
(plus a `[data-theme='dark']` override). Because the variables cascade from
`:root`, this works regardless of the components' hashed CSS-module class names —
no global selector ever needs to know the hashed names. Dark mode rides on
Docusaurus's existing `data-theme="dark"` attribute.

Rejected alternatives:

- `getClientModules` + a generated CSS file — more build machinery (temp files,
  ordering) for no gain over an inline tag.
- Client-side JS setting CSS variables — causes flash-of-unstyled-card and is not
  SSR-pure; violates the project's static-HTML stance.

## Config

The plugin takes one optional boolean.

```ts
// docusaurus.config.ts → plugins: []
[
  docusaurusGitlabTheme,
  { theme: true }, // default: true. false → inject nothing.
]
```

- `theme: true` (default) → inject the polished card `<style>`.
- `theme: false` → inject nothing; components fall back to the existing bare
  CSS-module styling.

Validation: a single optional boolean `theme`. Unknown keys are rejected.
Invalid config throws at build time with the
`@ebuildy/docusaurus-plugin-gitlab:` prefix, matching `resolveOptions` in
`src/options.ts`.

## Light / dark behavior

The injected CSS is theme-aware by construction:

- Cards are styled with Docusaurus's own `--ifm-*` variables
  (`--ifm-color-primary`, `--ifm-background-surface-color`,
  `--ifm-color-emphasis-*`), so colors track the active palette.
- Shadows use `rgb(0 0 0 / α)` so they adapt; a `[data-theme='dark']` block bumps
  the shadow strength so cards stay legible in dark mode.
- No hardcoded colors that would fight the active theme.

Toggling the Docusaurus light/dark switch restyles cards automatically, with no
client JS.

## The theme look (minimal but beautiful)

The injected `<style>` sets the `--gl-card-*` variables to the polished values;
the CSS module consumes them. Affected class names: `.card`, `.title`, `.muted`,
`.badge`, `.stats`, `.list`, `.listItem`, `.codeBlock`, etc.

- Card: 1px `--ifm-color-emphasis-200` border, ~10px radius, soft shadow
  (`0 1px 2px rgb(0 0 0 / .06), 0 2px 8px rgb(0 0 0 / .04)`), surface background.
- Subtle hover: border shifts toward `--ifm-color-primary`, shadow lifts slightly.
- Badges: pill shape, `--ifm-color-emphasis-100` background, accent text.
- Links/title: accent color from `--ifm-color-primary`, weight 600 title.
- Dark block: stronger shadow alpha, border via `--ifm-color-emphasis-300`.

With `theme: false` the variables are never defined, so the CSS-module fallbacks
(today's bare look) apply.

## File map

| File | Change |
|---|---|
| `src/plugin/index.ts` | New. Plugin factory `docusaurusGitlabTheme(context, options)` implementing `name` + `injectHtmlTags()` → inline `<style>` when `theme !== false`. |
| `src/plugin/theme.ts` | New. `resolveTheme(input)` (Joi validation + default) and `renderThemeCss()` — pure function returning the `:root { --gl-card-*: … }` + `[data-theme='dark']` CSS string. Separated so it is unit-testable without a Docusaurus context. |
| `src/components/styles.module.css` | Rewrite visual properties to read `var(--gl-card-*, <current-value>)`, where each fallback equals today's value (so `theme: false` is visually identical to now). No new component classes. |
| `package.json` | Add `./plugin` to `exports` and a `tsup` entry. |
| `tsup.config.ts` | Add `src/plugin/index.ts` entry. |
| `examples/site/docusaurus.config.ts` | Add the plugin to `plugins: []` with `{ theme: true }`. |
| `test/packaging.test.ts` | Assert the `/plugin` export resolves and stays ESM-only. |
| `src/gitlab/fetchers.ts` | `fetchProjectInfo`: localize `p.avatar_url` via `ctx.assets.localize` when present. |
| `src/components/GitlabProjectInfo.tsx` | Render a small rounded avatar `<img>` when `data.avatarUrl` is set. |

## Addition: project avatar in `GitlabProjectInfo`

Independent of the theme, but bundled into this change: show the project's avatar
in the project-overview card when one exists.

State today: `ProjectInfoData.avatarUrl` already exists and `fetchProjectInfo`
already maps `p.avatar_url ?? null` — but as the **raw remote URL**, and no
component renders it. Two gaps to close:

1. **Localize** (build time, no browser token). In `fetchProjectInfo`, when
   `p.avatar_url` is present, run it through `ctx.assets.localize(avatarUrl, "",
   project)` and store the returned local served path in `avatarUrl`. The avatar
   URL is absolute, so `AssetManager.absolute()` passes it through unchanged and
   the `ref` argument is unused (pass `""`). `requestBinary` carries the token, so
   private-project avatars work. Failure semantics match README image
   localization (no special-casing). When `avatar_url` is null, `avatarUrl` stays
   null and nothing is localized.
2. **Render** in `GitlabProjectInfo`: when `data.avatarUrl` is set, show a small
   rounded avatar `<img>` next to the title (with `alt={data.name}` and explicit
   width/height to avoid layout shift). When null, render the title as today.

No new domain type or fetcher; this reuses `ProjectInfoData`, `fetchProjectInfo`,
and `AssetManager`.

## Error handling

- Invalid `theme` value → throw at build with the package-prefixed message.
- `theme: false` → no tag injected; never errors.
- The plugin does no I/O and no network — `renderThemeCss` is a pure string
  builder, so there are no runtime failure modes beyond config validation.

## Testing

- `src/plugin/theme.test.ts` — unit tests for `resolveTheme` (default true,
  explicit false, invalid input throws) and `renderThemeCss` (defines
  `--gl-card-*` variables on `:root`, references `--ifm-*` for colors, contains a
  `[data-theme='dark']` block, contains no hardcoded hex palette colors that
  would override the theme).
- `src/plugin/index.test.ts` — `injectHtmlTags` returns a head style tag when
  enabled and nothing when `theme: false`.
- `test/packaging.test.ts` — `/plugin` subpath export resolves; ESM-only guard
  still holds.
- `src/gitlab/fetchers.test.ts` — `fetchProjectInfo` calls `assets.localize` with
  the avatar URL and returns the localized path; null `avatar_url` skips
  localization and leaves `avatarUrl` null.
- `src/components/GitlabProjectInfo.test.tsx` — renders an `img` with the avatar
  when `avatarUrl` is set; renders no avatar `img` when null.
- e2e (`test/e2e/build.test.ts`) — example site (now wiring the plugin) builds;
  run explicitly since it is slow.

Per `CLAUDE.md`: TDD (failing test first), Vitest, `npm run typecheck`.

## Docs

- README: a short "Card theme" section showing the `plugins: []` entry and the
  boolean.
- Note that `theme` defaults to `true`.
