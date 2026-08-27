/**
 * Prefixes localized-asset URLs with the Docusaurus site `baseUrl`.
 *
 * `AssetManager` emits site-ROOT-relative paths (`/gitlab-assets/<hash>.png`),
 * which are correct only when the site is served from `/`. A site with
 * `baseUrl: "/my-docs/"` serves the very same file from
 * `/my-docs/gitlab-assets/<hash>.png`, so the emitted `<img src>` 404s.
 *
 * `useBaseUrl` (Docusaurus's own answer) is a React hook and cannot reach
 * images inside `dangerouslySetInnerHTML` README/release HTML, nor the
 * `{@includeGitlab…}` path, which never renders through our components at all.
 * So the prefix is applied at build time instead.
 *
 * Applied on the way OUT — after the fetchers' cache, at the same two choke
 * points as the host mask (`src/remark/index.ts` for component props,
 * `src/include/loader.ts` for page text). Keeping it out of the cached value
 * means changing `baseUrl` takes effect on the next build with no
 * node_modules/.cache clear.
 *
 * Pure apart from the `siteBaseUrl` registry at the bottom.
 */

import { escapeRegExp, mapStringsDeep } from "./string-rewrite.js";

export interface AssetBaseUrlPrefixer {
  (value: string): string;
  /** True when the prefix is a no-op: site root, or a non-site-relative assetBaseUrl. */
  readonly disabled: boolean;
}

const IDENTITY: AssetBaseUrlPrefixer = Object.assign((value: string) => value, { disabled: true as const });

const SLASH = "/".charCodeAt(0);

/**
 * `value.replace()` with a trailing `/+` pattern, minus the regex. That
 * quantifier backtracks over a long run of slashes, which CodeQL flags as
 * polynomial ReDoS (js/polynomial-redos); scanning backwards is linear and
 * allocates only the final slice.
 */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === SLASH) end--;
  return end === value.length ? value : value.slice(0, end);
}

/**
 * `"/my-docs/"` (Docusaurus always stores a trailing slash) → `"/my-docs"`, and
 * the site root → `""`, so the result concatenates directly onto a path that
 * already begins with `/`.
 */
export function normalizeBaseUrl(raw: string | undefined): string {
  const trimmed = stripTrailingSlashes((raw ?? "").trim());
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function createAssetBaseUrlPrefixer(assetBaseUrl: string, siteBaseUrl: string): AssetBaseUrlPrefixer {
  const base = normalizeBaseUrl(siteBaseUrl);
  // A non-site-relative assetBaseUrl (an absolute CDN URL, say) is already a
  // complete address — the site's baseUrl has no bearing on it.
  if (!base || !assetBaseUrl.startsWith("/")) return IDENTITY;
  // Nor does an assetBaseUrl that already spells the baseUrl out, which is how
  // this had to be worked around before the prefix existed. Prefixing it again
  // would yield `/my-docs/my-docs/gitlab-assets/…`.
  if (assetBaseUrl === base || assetBaseUrl.startsWith(`${base}/`)) return IDENTITY;

  // The trailing `/` is part of the pattern: it both anchors the match to a
  // path-segment boundary (so `/gitlab-assets-other/…` is left alone) and
  // guarantees there is a filename to prefix.
  const path = `${stripTrailingSlashes(assetBaseUrl)}/`;
  const pattern = new RegExp(
    // Start of string, or a character that cannot continue a hostname or a path
    // segment. That keeps `https://host/gitlab-assets/x.png` — an absolute URL
    // that merely CONTAINS the path — from being rewritten, while still
    // matching after the delimiters the path actually appears behind: `"` and
    // `'` in HTML attributes, `(` in a markdown image, whitespace, `=`.
    `(^|[^A-Za-z0-9._~%:/@+-])` + escapeRegExp(path),
    "g",
  );

  // Function-form replacement: a string replacement would treat `$&`, `` $` ``,
  // `$'` and `$1` in the baseUrl specially. Same reasoning as `createHostMask`.
  const prefix = (value: string) => value.replace(pattern, (_m, lead: string) => `${lead}${base}${path}`);
  return Object.assign(prefix, { disabled: false as const });
}

export function prefixAssetUrlsDeep<T>(value: T, prefix: AssetBaseUrlPrefixer): T {
  if (prefix.disabled) return value;
  return mapStringsDeep(value, prefix);
}

/**
 * The site `baseUrl`, reported by the Docusaurus plugin.
 *
 * Only the Docusaurus plugin is handed a `LoadContext`; the remark plugin
 * receives nothing but its own options and the vfile (which carries no site
 * config). Since both ship from this one package and run in one process — with
 * plugin loading strictly before MDX compilation — the plugin publishes the
 * value here and the remark transformer reads it lazily, per build.
 *
 * The explicit `baseUrl` option wins over this, and is the answer for a site
 * that registers `remarkGitlab` without the Docusaurus plugin.
 */
let reported: string | undefined;

export function setSiteBaseUrl(raw: string | undefined): void {
  reported = normalizeBaseUrl(raw);
}

export function siteBaseUrl(): string | undefined {
  return reported;
}

/** Test seam. */
export function resetSiteBaseUrl(): void {
  reported = undefined;
}
