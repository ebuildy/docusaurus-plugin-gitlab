import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
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

// MDX treats raw HTML as JSX, where `style` must be an object, not a CSS string
// (React: "The `style` prop expects a mapping … not a string"). Convert
// `style="color: red"` into `style={{ color: "red" }}`.
const STYLE_ATTR_RE = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/gi;

function cssPropToJsKey(prop: string): string {
  if (prop.startsWith("--")) return JSON.stringify(prop); // CSS custom property → quoted key
  const camel = prop
    .toLowerCase()
    .replace(/^-ms-/, "ms-") // vendor `ms` prefix stays lowercase in React
    .replace(/^-(webkit|moz|o)-/, (_m, v: string) => `${v[0].toUpperCase()}${v.slice(1)}-`)
    .replace(/^-/, "")
    .replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
  return camel;
}

function cssToStyleObject(css: string): string {
  const entries: string[] = [];
  for (const decl of css.split(";")) {
    const colon = decl.indexOf(":");
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim();
    const value = decl.slice(colon + 1).trim();
    if (!prop || !value) continue;
    entries.push(`${cssPropToJsKey(prop)}: ${JSON.stringify(value)}`);
  }
  return `{{ ${entries.join(", ")} }}`;
}

function convertInlineStyles(text: string): string {
  return text.replace(STYLE_ATTR_RE, (_m, dq?: string, sq?: string) => {
    return `style=${cssToStyleObject(dq ?? sq ?? "")}`;
  });
}

/**
 * Built-in processor: convert HTML string `style="…"` attributes into JSX style
 * objects (`style={{ … }}`) so MDX/React accepts them, leaving fenced/inline code
 * untouched.
 */
export const fixInlineStyles: OutProcessor = (md) => mapProseRegions(md, convertInlineStyles);

// A README's own "Table of Contents" is redundant with the one Docusaurus renders
// in the right sidebar. Recognize a heading whose text is one of these.
const TOC_TITLES = new Set(["table of contents", "contents", "toc"]);
// Standalone GitLab `[[_TOC_]]` marker line.
const TOC_MARKER_RE = /^[^\S\r\n]*\[\[_toc_\]\][^\S\r\n]*\r?\n?/gim;

function isTocHeading(text: string): boolean {
  return TOC_TITLES.has(text.toLowerCase().replace(/[*_`:]/g, "").trim());
}

/**
 * Built-in processor: remove a redundant "Table of Contents" section (the heading
 * and everything up to the next heading of the same or higher level) and any bare
 * `[[_TOC_]]` marker. Headings inside code blocks are ignored (mdast never parses
 * them as headings). Opt-in via the `stripToc` option.
 */
export const stripTableOfContents: OutProcessor = (md) => {
  const out = md.replace(TOC_MARKER_RE, "");
  const tree = unified().use(remarkParse).use(remarkGfm).parse(out) as Root;

  const headings: Array<{ depth: number; line: number }> = [];
  visit(tree, "heading", (node) => {
    if (node.position?.start?.line != null) {
      headings.push({ depth: node.depth, line: node.position.start.line });
    }
  });

  const lines = out.split("\n");
  const tocIdx = headings.findIndex((h) =>
    isTocHeading((lines[h.line - 1] ?? "").replace(/^#{1,6}\s+/, "")),
  );
  if (tocIdx === -1) return out;

  const toc = headings[tocIdx];
  const next = headings.slice(tocIdx + 1).find((h) => h.depth <= toc.depth);
  const start = toc.line - 1;
  const end = next ? next.line - 1 : lines.length;
  lines.splice(start, end - start);
  return lines.join("\n");
};

// GitLab/GitHub alert blockquotes (`> [!note]`) map onto Docusaurus admonitions.
const ALERT_TO_ADMONITION: Record<string, string> = {
  note: "note",
  tip: "tip",
  important: "info",
  warning: "warning",
  caution: "danger",
};
const ALERT_HEAD_RE = /^>\s?\[!(note|tip|important|warning|caution)\](.*)$/i;
const FENCE_RE = /^\s*(`{3,}|~{3,})/;

function admonition(type: string, title: string, content: string[]): string {
  const kind = ALERT_TO_ADMONITION[type.toLowerCase()];
  const head = title.trim() ? `:::${kind}[${title.trim()}]` : `:::${kind}`;
  const body = content.join("\n").replace(/^\n+|\n+$/g, "");
  return `${head}\n\n${body}\n\n:::`;
}

/**
 * Built-in processor: translate GitLab/GitHub alert blockquotes (`> [!note]`,
 * `> [!warning]`, …) into native Docusaurus admonitions (`:::note … :::`), leaving
 * fenced code untouched. `important` → `info` and `caution` → `danger`.
 */
export const convertAlerts: OutProcessor = (md) => {
  const lines = md.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);
    if (fence !== null) {
      out.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      }
      i++;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      out.push(line);
      i++;
      continue;
    }
    const head = ALERT_HEAD_RE.exec(line);
    if (head) {
      const content: string[] = [];
      i++;
      while (i < lines.length && lines[i].startsWith(">")) {
        content.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(admonition(head[1], head[2], content));
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
};

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
