import type { Definition, Link, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { resolveRepoLink, type LinkMode } from "../gitlab/links.js";
import type { OutProcessor } from "./out-processors.js";

export interface RewriteLinksArgs {
  mode: LinkMode;
  publicUrl: string;
  project: string;
  ref: string;
  /** Repo-relative path of the included file; relative links resolve against
   *  its directory. README includes pass "README.md". */
  basePath?: string;
  linkBase?: string;
}

// Matches the tail of a `link` node's source, starting right after the label's
// closing "]": `](url)`, `](url "title")`, `](<url>)`, `](<url> 'title')`, …
const LINK_TAIL_RE =
  /^\]\((\s*)(<[^<>\n]*>|[^\s()]+)((?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'))?)(\s*)\)$/;

// Matches a whole `definition` node's source: `[id]: url` or `[id]: url "title"`.
const DEFINITION_RE =
  /^(\[(?:[^\]\\]|\\.)*\]:)(\s*)(<[^<>\n]*>|\S+)((?:\s+(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?)(\s*)$/;

/** Wrap `newUrl` in angle brackets iff the original destination was. */
function wrapLike(originalDest: string, newUrl: string): string {
  return originalDest.startsWith("<") ? `<${newUrl}>` : newUrl;
}

/**
 * Build the replacement text for a `link` node's full source range, or `null`
 * if its source doesn't match the expected `[label](url …)` shape (in which
 * case the caller leaves it untouched rather than guessing).
 */
function spliceLink(src: string, node: Link, newUrl: string): string | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (start == null || end == null) return null;

  // The label's own children carry their real positions — use the end of the
  // last one to find where the label closes, regardless of what it contains
  // (including nested inline code, which would otherwise split a naive regex
  // match across two "prose" chunks).
  const labelEnd = node.children.length
    ? node.children[node.children.length - 1]?.position?.end?.offset
    : start + 1; // "[" immediately followed by "]" for an empty label
  if (labelEnd == null || labelEnd < start || labelEnd > end) return null;

  const tail = src.slice(labelEnd, end);
  const m = LINK_TAIL_RE.exec(tail);
  if (!m) return null;
  const [, leadingWs, dest, title, trailingWs] = m;
  const newTail = `](${leadingWs}${wrapLike(dest, newUrl)}${title}${trailingWs})`;
  return src.slice(start, labelEnd) + newTail;
}

/**
 * Build the replacement text for a `definition` node's full source range, or
 * `null` if its source doesn't match the expected `[id]: url …` shape.
 */
function spliceDefinition(src: string, node: Definition, newUrl: string): string | null {
  const start = node.position?.start?.offset;
  const end = node.position?.end?.offset;
  if (start == null || end == null) return null;

  const whole = src.slice(start, end);
  const m = DEFINITION_RE.exec(whole);
  if (!m) return null;
  const [, prefix, leadingWs, dest, title, trailingWs] = m;
  return `${prefix}${leadingWs}${wrapLike(dest, newUrl)}${title}${trailingWs}`;
}

/**
 * Build an `OutProcessor` that rewrites every relative `link`/`definition`
 * URL in included GitLab markdown via `resolveRepoLink`, splicing the new URL
 * into the original source by node offsets (never re-serializing the mdast,
 * which would reformat the whole document). Image targets are left alone —
 * out of scope, and a broken image doesn't fail a Docusaurus build the way a
 * broken link does. Links inside fenced/inline code are naturally untouched:
 * remark never produces `link`/`definition` nodes there.
 */
export function rewriteRelativeLinks(args: RewriteLinksArgs): OutProcessor {
  return (md: string): string => {
    const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as Root;

    const edits: Array<{ start: number; end: number; text: string }> = [];
    visit(tree, ["link", "definition"], (node) => {
      const n = node as Link | Definition;
      const start = n.position?.start?.offset;
      const end = n.position?.end?.offset;
      if (start == null || end == null) return;

      const newUrl = resolveRepoLink(n.url, {
        mode: args.mode,
        publicUrl: args.publicUrl,
        project: args.project,
        ref: args.ref,
        basePath: args.basePath,
        linkBase: args.linkBase,
      });
      if (newUrl === n.url) return; // untouched by resolveRepoLink — leave the source alone

      const replacement =
        n.type === "link" ? spliceLink(md, n, newUrl) : spliceDefinition(md, n, newUrl);
      if (replacement != null) edits.push({ start, end, text: replacement });
    });

    if (edits.length === 0) return md;

    // Splice from the end of the document backwards so earlier offsets stay valid.
    edits.sort((a, b) => b.start - a.start);
    let out = md;
    for (const edit of edits) {
      out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    }
    return out;
  };
}
