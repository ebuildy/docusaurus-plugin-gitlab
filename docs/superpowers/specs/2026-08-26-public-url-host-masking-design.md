# Design: `gitlabPublicUrl` — masking the internal GitLab host in build output

**Date:** 2026-08-26
**Status:** Draft — awaiting review
**Issue:** [#44 — Add gitlabPublicURL options](https://github.com/ebuildy/docusaurus-plugin-gitlab/issues/44)

## Problem

A site can be built against an **internal** GitLab (`https://gitlab.internal:8080`,
a VPN-only hostname, a reverse-proxy backdoor) while the published docs are read
by people who can only reach the **public** URL (`https://gitlab.example.com`).

Today that internal host leaks into the static output. Two families of leak, and
they need different mechanisms:

**Structured data** — GitLab embeds its own host in API payloads, which we
normalize into component props verbatim:

| leak | source |
|---|---|
| `webUrl` on projects, issues, commits, users, topics, labels, epics, milestones | `p.web_url`, `i.web_url`, … ([fetchers.ts:148](../../../src/gitlab/fetchers.ts#L148), `:206`, `:223`, `:500`, `:638`, `:840`, `:872`) |
| `authorWebUrl` on issues | `i.author?.web_url` ([fetchers.ts:209](../../../src/gitlab/fetchers.ts#L209)) |
| release page + asset links | `r._links.self`, `assets.links[].url` ([fetchers.ts:186](../../../src/gitlab/fetchers.ts#L186)) |
| topic / label browse URLs | built from `host` ([fetchers.ts:429](../../../src/gitlab/fetchers.ts#L429), `:480`) |
| absolute links inside rendered markdown | README / release-note / file HTML — links GitLab already absolutized |
| images that could not be localized | `AssetManager.absolute()` → `${host}/${project}/-/raw/…` ([assets.ts:29](../../../src/gitlab/assets.ts#L29)) |
| fetch failure messages | gitbeaker errors carry the request URL, rendered by `Fallback` when `strict: false` ([Fallback.tsx](../../../src/components/Fallback.tsx)) |

**Plain text** — the host appears as prose, not as a link target: inside included
README bodies, in project descriptions written into generated-page frontmatter,
in code samples, in a sentence a docs author typed. No URL-aware rewriter sees
any of it.

## Summary

Add a **new** plugin option `gitlabPublicUrl`. When set, every occurrence of the
literal `host` string in build output is replaced with it — in structured
component data **and** in plain text. Empty or unset ⇒ nothing happens.

```text
host:            https://gitlab.internal:8080
gitlabPublicUrl: https://gitlab.example.com

data.webUrl        "https://gitlab.internal:8080/acme/app"
                →  "https://gitlab.example.com/acme/app"

prose in a README  "clone from https://gitlab.internal:8080/acme/app.git"
                →  "clone from https://gitlab.example.com/acme/app.git"
```

### `gitlabPublicUrl` is **not** `publicUrl`

These are separate options and must stay separate.

| | `publicUrl` (exists) | `gitlabPublicUrl` (new) |
|---|---|---|
| **Means** | the base URL relative links should be rewritten to point at | the public face of the GitLab instance named by `host` |
| **Not necessarily GitLab** | correct — it can be the Docusaurus site URL, so relative repo links land back inside the docs site | always GitLab: it is the replacement for `host` |
| **Consumed by** | `resolveRepoLink` ([links.ts:77](../../../src/gitlab/links.ts#L77)), one call site, link targets only | a global substitution pass over output strings |
| **Default** | `host` | `""` — disabled |
| **Scope** | relative link hrefs in fetched markdown | every output string, URL or not |

Because they answer different questions, collapsing them would break the case
`publicUrl` exists to serve: pointing relative links at the docs site while
still masking the GitLab host everywhere it appears. **This design leaves
`publicUrl` completely untouched** — no behavior change, no doc change.

### Naming

The issue title says `gitlabPublicURL`. Repo convention is `…Url`
(`publicUrl`, `assetBaseUrl`, `avatarUrl`), so the option is **`gitlabPublicUrl`**
unless you want the outlier.

## Non-goals

- **Not a security boundary.** This masks *page output* only. The internal host
  still appears in build logs, `debug` traces, strict-mode errors thrown to the
  console, and verbatim in the on-disk cache under `node_modules/.cache`. Anyone
  with the build environment still sees it. The README must say so plainly, so
  nobody mistakes this for secret hiding.
- **Not a proxy.** Fetching still goes to `host`. `gitlabPublicUrl` is never
  requested at build time and is not checked for reachability.
- **Not alias handling.** Only the configured `host` string is matched. See
  [Known limitation](#known-limitation-host-aliases).

## Architecture

A new **pure module** `src/gitlab/mask-host.ts`. No I/O, no cache, nothing to
mock — the same shape as `src/gitlab/links.ts`.

```ts
export interface HostMask {
  /** Apply the mask to one string. */
  (value: string): string;
}

/** Returns identity when masking is disabled (gitlabPublicUrl empty or === host). */
export function createHostMask(host: string, gitlabPublicUrl: string): HostMask;

/** Structural walk: strings, arrays, plain objects. Returns the input
 *  unchanged (same reference) when nothing matched. */
export function maskHostDeep<T>(value: T, mask: HostMask): T;
```

### Where it runs — two choke points

| # | Site | Covers |
|---|---|---|
| 1 | `src/remark/index.ts` — around `injectProp(node, "data" \| "error", …)` | structured data for all 11 registered components, in one place |
| 2 | `src/include/loader.ts` — the string handed to `callback`, on **both** return paths | all plain text in every `.md`/`.mdx` in the site: include bodies, generated pages, user prose |

**(1) Structured data.** Every component receives its props through
`injectProp`, so a deep mask there covers `webUrl`, `avatarUrl`, release assets,
rendered README HTML, `GitlabFile` code content, and error messages — without
touching a fetcher or a component.

```ts
// src/remark/index.ts, hoisted once per plugin instance
const mask = createHostMask(options.host, options.gitlabPublicUrl);
// …inside the per-node job
const data = maskHostDeep(await fetcher(ctx, attrs), mask);
injectProp(node, "data", data);
```

Mask *before* the `sidebarReadmes.push({ node, entries: data.toc })` branch so
the TOC entries fed to `mergeReadmeTocs` come from the same masked object.
`TocEntry` carries no URL today (`level`, `id`, `text`), so this is insurance
against a future field, not a live bug — but it costs nothing and settles the
question.

Masking the `error` branch is not incidental: a gitbeaker failure message embeds
the request URL, and with `strict: false` that message is rendered into the page
by `Fallback`. Leaving it unmasked would leak the host on exactly the builds most
likely to ship without anyone noticing.

**(2) Plain text.** The include loader is already registered against every
`.md`/`.mdx` under `siteDir` ([plugin/index.ts](../../../src/plugin/index.ts),
`buildIncludeLoaderRule`), which makes it the one place where all page text
passes through as a string. Mask the loader's output.

Note the early return in [loader.ts](../../../src/include/loader.ts): a file with
no `{@includeGitlab` placeholder skips `transformIncludes` entirely. The mask
must therefore sit at both `callback` sites, not inside `transformIncludes` —
otherwise ordinary pages go unmasked.

```ts
// src/include/loader.ts
const mask = createHostMask(resolved.host, resolved.gitlabPublicUrl);
// both paths:
callback(null, mask(rewritten));          // no-include fast path
callback(null, mask(out));                // after transformIncludes
```

**`src/generate/*` needs nothing of its own.** Generated pages are written into
`siteDir/docs` during the plugin factory, before webpack runs — so their text
(including a `project.description` that mentions the host in frontmatter) flows
through choke point (2) like any other file.

### What "even plain text" costs

Masking the whole loader output means the substitution also lands in text this
plugin did not author: a docs page that deliberately quotes the internal host, or
a fenced code block showing an internal clone URL, gets rewritten too.

That is the literal reading of the issue (*"for any string, basically, do the
string replace"*) and it is what makes the guarantee simple and checkable — **the
internal host does not appear in a built page**. A narrower rule ("only text this
plugin generated") would leave the host visible in the case most likely to
matter: someone pasting it into a doc by hand.

Worth stating explicitly because it is a real consequence, and because the
opt-out is just "don't set the option".

### Matching rules

The mask is built once per plugin instance from the resolved options, both
already trailing-slash-stripped by `resolveOptions`.

1. **Origin case-insensitive, path case-sensitive.** Hostnames are
   case-insensitive, so a `host` of `https://GitLab.internal` must still match
   `https://gitlab.internal/…` in a payload; a `host` carrying a path prefix
   (`https://example.com/gitlab`) must not, since paths are case-sensitive. Split
   with `new URL(host)`, build the regex as `escape(origin)` (flag `i`) +
   `escape(pathname)` (literal).
2. **Percent-encoded form too.** Badge and shield URLs nest the instance URL in a
   query string (`?url=https%3A%2F%2Fgitlab.internal`). A literal-only replace
   misses those, so the same pass also maps `encodeURIComponent(host)` →
   `encodeURIComponent(gitlabPublicUrl)`.
3. **Global** — every occurrence, not the first.
4. **No-op fast path.** Empty `gitlabPublicUrl`, or one equal to `host`, makes
   `createHostMask` return the identity function and `maskHostDeep`
   short-circuit. The default configuration pays nothing, and every existing site
   keeps byte-identical output.

### Options wiring

```ts
// src/options.ts
/** Public GitLab base URL substituted for `host` in every build output string —
 *  component data, rendered HTML, and plain page text. Empty ⇒ no substitution.
 *  Distinct from `publicUrl`, which only sets where relative links point.
 *  Default: `""`. */
gitlabPublicUrl?: string;
```

- `ResolvedOptions.gitlabPublicUrl: string`
- Joi: `Joi.string().uri().allow("").optional()`
- Resolve: `(opts.gitlabPublicUrl ?? "").replace(/\/+$/, "")` — **no** fallback to
  `host` (that would be a permanent no-op, and empty is the documented "off")
- Threaded to the loader via `resolved` (already serialized wholesale) and to the
  remark transformer via `resolveOptions` — **not** through `GitLabContext`: the
  mask is an output concern, and `ctx.options` is what fetchers read.

### Caching

The mask runs **after** the fetchers' `memo(...)` cache reads and after the
loader's transform, deliberately. The cache stores the internal host verbatim and
the substitution happens on the way out, so changing `gitlabPublicUrl` takes
effect on the very next build — no `node_modules/.cache` clear, no TTL wait.

## Known limitation: host aliases

GitLab builds `web_url` from **its own** configured `external_url`, not from the
URL the build used to reach it. Usually identical; not always. A build hitting
`http://gitlab.internal:8080` may receive payloads already containing
`https://gitlab.example.com`, or some third value.

Only the configured `host` is matched, so a third value survives untouched.
Acceptable — masking is best-effort and one internal hostname is the common case
— but it must be **documented**, not discovered in a published page.

The escape hatch, if anyone asks, is additive and does not disturb this design:
let the option take an array of source strings, or add a separate `hostAliases`
list. Deferred.

## Alternatives considered

**Extend `publicUrl` instead of adding an option.** Rejected — see
[the table above](#gitlabpublicurl-is-not-publicurl). `publicUrl` may legitimately
be a non-GitLab URL, so it cannot double as the replacement for `host`.

**Mask inside each fetcher, at normalization time.** Rejected: ~15 call sites and
a new one to remember per component added, versus one. It would also bake the
masked value into the cache, so changing the option would require clearing
`node_modules/.cache`.

**Mask in the components at render time.** Rejected: components must stay pure
and prop-driven (CLAUDE.md), and the mask would ship to the browser bundle along
with the internal host it is meant to hide.

**Point `GitLabClient` at `gitlabPublicUrl`.** Rejected: different feature, and it
defeats the purpose — the internal host exists precisely because the public one
is not reachable from the builder.

## Testing

TDD per CLAUDE.md — failing test first at each step.

- **`src/gitlab/mask-host.test.ts`** (new, pure): identity when the option is
  empty; identity when it equals `host`; single and repeated occurrences;
  case-insensitive origin (`https://GitLab.internal` matches
  `https://gitlab.internal/x`); path-prefixed host stays case-sensitive;
  percent-encoded form; port preserved; a non-matching string returns the same
  reference; `maskHostDeep` over nested objects / arrays / `null` / numbers;
  non-plain values (`Date`) pass through untouched.
- **`src/options.test.ts`**: defaults to `""`; strips trailing slashes; rejects a
  non-URI value; accepts `""`; **does not** default to `host`; `publicUrl`
  assertions unchanged.
- **`src/remark/index.test.ts`**: a fetcher returning an internal-host `webUrl` is
  injected with the public one; the `error` path is masked; with the option unset,
  injected data is byte-identical to today.
- **`src/include/loader.test.ts`**: masked on the no-include fast path (the
  regression the early return invites); masked on the `transformIncludes` path;
  identity when the option is unset.
- **`test/e2e/build.test.ts`**: with `gitlabPublicUrl` set, the internal host
  string appears nowhere in the built HTML. Run explicitly (slow, ~1 min).

## Documentation

- README options table: new `gitlabPublicUrl` row, placed next to `publicUrl`
  with one line drawing the distinction.
- README: a short "Hiding an internal GitLab host" subsection — what it covers,
  that it also rewrites plain text including hand-written prose, the alias
  limitation, and one sentence stating it is output masking and not a security
  boundary.
- `src/options.ts`: doc comment as above.
- CHANGELOG lands via release-please from the commit message
  (`feat(options): add gitlabPublicUrl to mask the internal host in output`).

## Open question

**Warn when `gitlabPublicUrl` is set but nothing matched in a build?** Cheap — a
counter on the mask plus one `logger.warn` at teardown — and it surfaces the alias
problem at build time instead of in production. Proposed: yes, but separable into
a follow-up if you would rather keep this change minimal.
