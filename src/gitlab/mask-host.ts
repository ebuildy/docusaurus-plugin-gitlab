/**
 * Substitutes the build-time GitLab `host` for its public-facing URL
 * (`gitlabPublicUrl`) in output strings. Pure: no I/O, no cache, no imports
 * from the rest of the package.
 *
 * Applied at two choke points — `src/remark/index.ts` (structured component
 * props) and `src/include/loader.ts` (plain page text). See
 * docs/superpowers/specs/2026-08-26-public-url-host-masking-design.md.
 */

import { escapeRegExp, mapStringsDeep } from "./string-rewrite.js";

export interface HostMask {
  (value: string): string;
  /** True when the mask is a no-op: no host, no public url, or the two are equal. */
  readonly disabled: boolean;
}

const IDENTITY: HostMask = Object.assign((value: string) => value, { disabled: true as const });

/**
 * Rewrites every ASCII letter as a two-case character class. This buys
 * case-insensitive matching for ONE part of a pattern; the `i` flag would
 * loosen the whole pattern, and hostnames are case-insensitive while paths
 * are not.
 */
function expandCase(source: string): string {
  return source.replace(/[a-z]/gi, (c) => `[${c.toLowerCase()}${c.toUpperCase()}]`);
}

/**
 * Splits a URL into its origin and whatever path follows. `URL` lowercases the
 * host but never changes its length, so slicing the ORIGINAL string by the
 * origin's length preserves the author's casing. A value that does not parse as
 * a URL is treated as all-path, i.e. matched case-sensitively.
 */
function splitOrigin(url: string): [origin: string, rest: string] {
  try {
    const { origin } = new URL(url);
    return [url.slice(0, origin.length), url.slice(origin.length)];
  } catch {
    return ["", url];
  }
}

export function createHostMask(host: string | undefined, gitlabPublicUrl: string | undefined): HostMask {
  const from = (host ?? "").replace(/\/+$/, "");
  const to = (gitlabPublicUrl ?? "").replace(/\/+$/, "");
  if (!from || !to || from === to) return IDENTITY;

  const [origin, rest] = splitOrigin(from);
  // Boundary guard: without it this is an unanchored substring match, so a
  // configured host that is a strict prefix of a longer, unrelated hostname
  // or path segment (`gitlab.internal` inside `gitlab.internal2.other.com`,
  // or a path prefix `/GitLab` inside `/GitLabExtra`) would corrupt output.
  // The negative lookahead blocks the match only when the next character
  // could continue a hostname/path segment. Applied identically to both the
  // literal and percent-encoded patterns: for the encoded form, a legitimate
  // continuation there is `%2F` (an encoded `/`), and `%` is not in the
  // blocked set, so `…gitlab.internal%2Fx` still matches correctly.
  // Accepted limitation (not fixed here): a host configured without a port
  // still matches text carrying one (`gitlab.internal` matches inside
  // `gitlab.internal:8080/x`), since `:` is deliberately not in the blocked
  // set — blocking it would break a host whose own path legitimately
  // precedes a colon in prose. We err toward masking: a missed match leaks
  // the internal host, which is the one failure mode this feature exists to
  // prevent.
  const boundary = "(?![A-Za-z0-9.-])";
  const literal = new RegExp(expandCase(escapeRegExp(origin)) + escapeRegExp(rest) + boundary, "g");
  // Badge and shield URLs nest the instance URL inside a query string, where it
  // arrives percent-encoded. encodeURIComponent works per character, so
  // encoding the two halves separately equals encoding the whole. Running
  // expandCase over the encoded form also tolerates lowercase hex (%3a vs %3A).
  const encoded = new RegExp(
    expandCase(escapeRegExp(encodeURIComponent(origin))) + escapeRegExp(encodeURIComponent(rest)) + boundary,
    "g",
  );
  const encodedTo = encodeURIComponent(to);

  // Function-form replacements: `String.prototype.replace` treats `$&`, `` $` ``,
  // `$'`, `$$`, `$1` etc. specially in a string replacement even with no capture
  // groups in the pattern. `$` is a legal URI sub-delim (Joi's `.uri()` doesn't
  // reject it), so a `gitlabPublicUrl` containing `$` would otherwise be
  // silently mangled. The function form bypasses special-pattern parsing.
  const mask = (value: string) => value.replace(literal, () => to).replace(encoded, () => encodedTo);
  return Object.assign(mask, { disabled: false as const });
}

/**
 * Structural walk over strings, arrays, and plain objects. Anything else
 * (Date, Map, class instances) passes through by reference. Returns the input
 * unchanged — same reference — when nothing matched, so an unset option costs
 * no allocation.
 */
export function maskHostDeep<T>(value: T, mask: HostMask): T {
  if (mask.disabled) return value;
  return mapStringsDeep(value, mask);
}
