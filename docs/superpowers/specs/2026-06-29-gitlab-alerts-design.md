# GitLab Markdown Alerts — Design

**Status:** Approved
**Date:** 2026-06-29

## Summary

Add support for GitLab's [Markdown *alerts*](https://docs.gitlab.com/user/markdown/#alerts) to
the markdown rendering pipeline, mirroring how the `[[_TOC_]]` marker is already handled. An alert
is a blockquote whose first line is a type marker — `> [!note]`, `> [!tip]`, `> [!important]`,
`> [!caution]`, `> [!warning]` — optionally followed by a custom title on the same line. The
rendered output is a styled callout box that reuses the Docusaurus/Infima theme `alert` classes so
it inherits theme colors with no bundled CSS.

This applies everywhere `renderMarkdown` is used (README, file markdown, release notes).

## Scope

**In scope**

- The five GitLab alert types via the `> [!type]` single-blockquote syntax.
- Case-insensitive type matching (`[!note]`, `[!NOTE]`, `[!Note]` all map to the same alert).
- Custom title override on the marker line (`> [!warning] Data deletion`).
- Default title = capitalized type name when no custom title is given.

**Out of scope (deferred)**

- GitLab's `>>>` multiline blockquote fence syntax. This is not standard Markdown — `remark-parse`
  does not recognize `>>>` as a blockquote — so it would require a pre-parse text transform with its
  own edge cases (nesting, lists inside the fence). Deferred to a later iteration; every alert form
  in this spec is a normal Markdown blockquote detectable on the tree.
- Bundled CSS / SVG icons. Styling is left to the consumer's theme (see Class mapping).

## Approach

A custom **rehype** plugin, `rehypeGitlabAlerts`, in a new file `src/gitlab/alerts.ts`, wired into
`renderMarkdown` immediately **after** `rehype-sanitize` — the same pipeline slot
`rehypeGitlabToc` occupies. Running post-sanitize means:

- the alert body is already sanitized;
- the classes, `role`, and title node we inject cannot be stripped by the sanitize schema (no schema
  changes needed);
- the security posture matches the TOC feature exactly.

Alternatives considered and rejected:

- **`remark-github-blockquote-alert`** (off-the-shelf): GitHub-flavored (uppercase only), no
  custom-title support, emits non-Infima classes, runs pre-sanitize. Does not match GitLab semantics
  or the Infima-class goal.
- **Custom remark (mdast) plugin, pre-sanitize**: would require allow-listing every injected class
  and attribute in the sanitize schema — the exact fragility the TOC plugin avoided by going
  post-sanitize.

## Class mapping & output structure

Each GitLab type maps to an Infima theme variant (so it picks up theme colors for free) and also
carries a stable `gitlab-md-alert--<type>` hook class for consumers that want to target GitLab
semantics directly.

| GitLab type | Default title | Infima variant class |
|---|---|---|
| `note` | Note | `alert--secondary` |
| `tip` | Tip | `alert--success` |
| `important` | Important | `alert--info` |
| `caution` | Caution | `alert--warning` |
| `warning` | Warning | `alert--danger` |

The matched `<blockquote>` is rewritten **in place** to a `<div>` (Infima `.alert` is a div),
preserving its already-sanitized body. Example for `> [!warning] Data deletion`:

```html
<div class="gitlab-md-alert gitlab-md-alert--warning alert alert--danger" role="alert">
  <p class="gitlab-md-alert-title">Data deletion</p>
  <p>The following instructions will make your data unrecoverable.</p>
</div>
```

Title text = custom title if present, else the capitalized default from the table. Both the GitLab
hook classes and the Infima classes are emitted.

## Detection & rewrite logic (`src/gitlab/alerts.ts`)

`rehypeGitlabAlerts()` returns a transform that visits `blockquote` elements:

1. Find the first child that is a `<p>`. Read its leading text — the concatenation of leading text
   nodes up to the first newline / `<br>`.
2. Match `^\s*\[!(note|tip|important|caution|warning)\]([^\n]*)` **case-insensitively** against that
   leading text.
   - No match, or an unknown type → **leave the blockquote untouched** (stays a plain blockquote).
3. On match:
   - `type` = lowercased capture; `customTitle` = trimmed remainder (may be empty).
   - **Strip the marker** (plus any custom-title text and its trailing newline / `<br>`) from the
     paragraph's leading content, leaving the real body. If that leaves the first paragraph empty,
     drop it.
   - Mutate the node: `tagName = "div"`, set `className` to the four classes from the table, set
     `role="alert"`.
   - Prepend `<p class="gitlab-md-alert-title">{title}</p>`.

Pure, unit-testable helpers mirror `toc.ts`:

- `ALERT_TYPES`: a map of `type → { defaultTitle, infimaClass }`.
- a small builder for the title node.

### Edge cases

- Marker-only blockquote (no body) → alert with just a title; no stray empty paragraph.
- Custom title containing inline markdown → reduced to plain text.
- Multiple blockquotes in one document → each handled independently.
- Marker not at the paragraph start (text before `[!note]`) → no transform.
- Unknown type (`[!foo]`) → no transform.

## Pipeline wiring & security

In `src/gitlab/markdown.ts`, add one step after the sanitize/TOC steps:

```js
.use(rehypeRaw)
.use(rehypeSanitize)
.use(rehypeGitlabToc)
.use(rehypeGitlabAlerts)   // new, post-sanitize
.use(collect)
.use(rehypeStringify)
```

**Security:** post-sanitize, the body is already clean. The plugin only (a) restructures existing
nodes, (b) adds static, hard-coded classes and `role`, and (c) inserts the title as a hast **text
node**, which is escaped on stringify. A title such as `> [!warning] <img src=x onerror=alert(1)>`
becomes inert escaped text. No schema changes and no new `dangerouslySetInnerHTML` paths. The
existing XSS regression test in `markdown.test.ts` stays green, and an alert-specific XSS test is
added.

## Testing (`src/gitlab/alerts.test.ts`) — TDD, write tests first

Behavior-level tests through `renderMarkdown`, plus direct unit tests of the plugin and helpers.
Thorough coverage is a priority:

- All five types → correct `gitlab-md-alert--<type>` + Infima class + default title (one test each).
- Case-insensitivity: `[!NOTE]`, `[!Note]`, `[!note]` all produce the note alert.
- Custom title: `> [!warning] Data deletion` → title "Data deletion", danger variant.
- Empty custom title: `> [!tip]` alone → default "Tip" title.
- Marker-only blockquote (no body) → alert with title, no empty stray paragraph.
- Body markdown preserved: bold / links / lists inside the alert survive and render.
- Unknown type `[!foo]` → untouched plain `<blockquote>`, no alert classes.
- Non-alert blockquote (plain quote) → untouched.
- Marker not at start (text before `[!note]`) → no transform.
- Multiple alerts in one document → each transformed independently.
- XSS in custom title → escaped, no executable HTML.
- TOC + alert coexistence → both transforms apply in the same document.
- `role="alert"` present on output.
- Pure-helper unit tests for the `ALERT_TYPES` mapping and the title-node builder.

## Documentation

- Add a GitLab alerts section to `README.md` documenting the syntax, the five types, custom titles,
  and the emitted classes; add `gitlab-md-alert`, `gitlab-md-alert--<type>`, and
  `gitlab-md-alert-title` rows to the README class table.
- Add an example page under `examples/site/docs/` demonstrating each alert type.

## Verification

After implementation: `npx vitest run` and `npm run typecheck` (per CLAUDE.md). The e2e build is not
required for this change but may be run if the pipeline wiring is touched in unexpected ways.
