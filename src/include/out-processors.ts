import { mapProseRegions } from "./render-source.js";

/**
 * A post-processor that rewrites the markdown generated from a GitLab include
 * before it is handed to Docusaurus. Runs on markdown includes (README and
 * `.md`/`.mdx`/`.markdown` files), not on code-file fences. May be async.
 */
export type OutProcessor = (markdown: string) => string | Promise<string>;

// CommonMark autolinks. MDX parses `<https://…>` / `<a@b.com>` as JSX and fails,
// so we rewrite them to plain markdown links (which MDX accepts) — preserving the
// link instead of merely escaping the `<`.
const URI_AUTOLINK_RE = /<([a-z][a-z0-9+.-]*:[^\s<>]*)>/gi;
const EMAIL_AUTOLINK_RE = /<([^\s<>@]+@[^\s<>@][^\s.<>@]*\.[^\s<>@]+)>/g;

function convertAutolinks(text: string): string {
  return text
    .replace(URI_AUTOLINK_RE, (_m, uri: string) => {
      const label = /^mailto:/i.test(uri) ? uri.slice("mailto:".length) : uri;
      return `[${label}](${uri})`;
    })
    .replace(EMAIL_AUTOLINK_RE, (_m, email: string) => `[${email}](mailto:${email})`);
}

/**
 * Built-in processor: convert CommonMark autolinks (`<https://…>`, `<mailto:…>`,
 * `<user@host>`) into MDX-safe markdown links, leaving fenced/inline code untouched.
 */
export const fixAutolinks: OutProcessor = (md) => mapProseRegions(md, convertAutolinks);

// HTML void elements never have a closing tag, but MDX requires them to be
// self-closing (`<br/>`). GitLab/GitHub markdown writes them unclosed (`<br>`),
// which MDX rejects ("Expected a closing tag for `<br>`"), so normalize them.
const VOID_ELEMENTS = "area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr";
const VOID_TAG_RE = new RegExp(`<(${VOID_ELEMENTS})\\b([^>]*)>`, "gi");

function selfCloseVoidTags(text: string): string {
  return text.replace(VOID_TAG_RE, (_m, name: string, rest: string) => {
    // Drop trailing whitespace and a trailing `/` (already self-closed), then
    // re-emit in MDX's required `<name … />` form.
    const attrs = rest.replace(/\s*\/?$/, "");
    return `<${name}${attrs} />`;
  });
}

/**
 * Built-in processor: self-close HTML void elements (`<br>` → `<br/>`, `<img …>` →
 * `<img … />`) so MDX accepts them, leaving fenced/inline code untouched. Already
 * self-closed tags are left effectively unchanged.
 */
export const fixVoidTags: OutProcessor = (md) => mapProseRegions(md, selfCloseVoidTags);

/** Run processors in order over `md`. */
export async function applyOutProcessors(md: string, procs: OutProcessor[]): Promise<string> {
  let out = md;
  for (const proc of procs) out = await proc(out);
  return out;
}

// Functions can't be threaded through webpack loader options (they aren't
// serializable), so the plugin registers them here (in-process) keyed by a plain
// string id, and the loader reads them back by that same id.
const registry = new Map<string, OutProcessor[]>();

export function registerOutProcessors(key: string, procs: OutProcessor[]): void {
  registry.set(key, procs);
}

export function getOutProcessors(key: string): OutProcessor[] {
  return registry.get(key) ?? [];
}
