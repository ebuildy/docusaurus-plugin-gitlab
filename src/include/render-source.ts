import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { applyLineRange, languageFromPath } from "../gitlab/code.js";
import type { GitLabContext } from "../gitlab/fetchers.js";

/** Remove a single leading YAML frontmatter block (--- … ---). */
export function stripFrontmatter(md: string): string {
  return md.replace(/^\ufeff?---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

/** Character offset ranges [start, end) of fenced/indented/inline code in `md`. */
export function codeRanges(md: string): Array<[number, number]> {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(md) as Root;
  const ranges: Array<[number, number]> = [];
  visit(tree, ["code", "inlineCode"], (node) => {
    if (node.position?.start?.offset != null && node.position?.end?.offset != null) {
      ranges.push([node.position.start.offset, node.position.end.offset]);
    }
  });
  return ranges.sort((a, b) => a[0] - b[0]);
}

export interface ProseHelpers {
  localizeImage: (url: string) => Promise<string>;
  absolutizeLink: (url: string) => string;
}

const IMG_EXTERNAL = /^(?:https?:|data:|\/\/)/i;
const LINK_KEEP = /^(?:https?:|mailto:|tel:|#|\/\/)/i;

const MD_IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
const MD_LINK_RE = /(?<!!)\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
const HTML_IMG_SRC_RE = /(<img\b[^>]*?\ssrc=")([^"]*)(")/gi;

async function replaceAsync(
  input: string,
  re: RegExp,
  fn: (m: RegExpExecArray) => Promise<string>,
): Promise<string> {
  const matches = [...input.matchAll(re)];
  if (matches.length === 0) return input;
  const replacements = await Promise.all(matches.map((m) => fn(m as RegExpExecArray)));
  let out = "";
  let last = 0;
  matches.forEach((m, i) => {
    out += input.slice(last, m.index) + replacements[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + input.slice(last);
}

/** Escape MDX-significant characters in prose. Leaves real HTML tags/comments intact. */
export function escapeMdx(s: string): string {
  return s
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    // Escape `<` unless it starts a real tag: an opening tag (`<div`), a closing
    // tag (`</div`), or an HTML comment (`<!--`). A bare `<` or a stray `</`
    // (e.g. `</ `, `</>`) is neutralized so it can't break MDX parsing.
    .replace(/<(?![a-z]|\/[a-z]|!--)/gi, "&lt;");
}

/** Apply `fn` to every non-code region of `md`, leaving fenced/inline code verbatim. */
export function mapProseRegions(md: string, fn: (prose: string) => string): string {
  const ranges = codeRanges(md);
  const out: string[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // skip nested/overlapping ranges
    out.push(fn(md.slice(cursor, start)));
    out.push(md.slice(start, end));
    cursor = end;
  }
  out.push(fn(md.slice(cursor)));
  return out.join("");
}

/** Rewrite images/links and MDX-escape a non-code region of markdown. */
export async function transformProse(text: string, h: ProseHelpers): Promise<string> {
  let out = await replaceAsync(text, MD_IMAGE_RE, async (m) => {
    const [, alt, url, title] = m;
    if (IMG_EXTERNAL.test(url)) return m[0];
    return `![${alt}](${await h.localizeImage(url)}${title})`;
  });
  out = await replaceAsync(out, HTML_IMG_SRC_RE, async (m) => {
    const [, pre, url, post] = m;
    if (IMG_EXTERNAL.test(url)) return m[0];
    return `${pre}${await h.localizeImage(url)}${post}`;
  });
  out = await replaceAsync(out, MD_LINK_RE, async (m) => {
    const [, label, url, title] = m;
    if (LINK_KEEP.test(url)) return m[0];
    return `[${label}](${h.absolutizeLink(url)}${title})`;
  });
  return escapeMdx(out);
}

const MD_EXT = /\.(?:md|mdx|markdown)$/i;

/** Whether an include's content is treated as markdown (vs. a fenced code block). */
export function isMarkdownSource(kind: "readme" | "file", path?: string): boolean {
  return kind === "readme" || (path != null && MD_EXT.test(path));
}

function absolutizeFactory(host: string, project: string, ref: string) {
  return (url: string) => {
    const clean = url.replace(/^\.?\//, "");
    return `${host}/${project}/-/blob/${ref}/${clean}`;
  };
}

/** Walk code ranges verbatim, transform prose between them. */
export async function processMarkdownSource(md: string, h: ProseHelpers): Promise<string> {
  const ranges = codeRanges(md);
  const out: string[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue; // skip nested/overlapping ranges
    out.push(await transformProse(md.slice(cursor, start), h));
    out.push(md.slice(start, end));
    cursor = end;
  }
  out.push(await transformProse(md.slice(cursor), h));
  return out.join("");
}

export interface RenderSourceOptions {
  ctx: GitLabContext;
  project: string;
  ref: string;
  kind: "readme" | "file";
  path?: string;
  lineRange?: string;
}

/** Turn fetched GitLab content into MDX-safe markdown source text. */
export async function renderSource(raw: string, o: RenderSourceOptions): Promise<string> {
  if (isMarkdownSource(o.kind, o.path)) {
    const body = stripFrontmatter(raw);
    return processMarkdownSource(body, {
      localizeImage: (u) => o.ctx.assets.localize(u, o.ref, o.project),
      absolutizeLink: absolutizeFactory(o.ctx.options.host, o.project, o.ref),
    });
  }
  const sliced = applyLineRange(raw, o.lineRange);
  const lang = languageFromPath(o.path ?? "");
  return `\n\`\`\`${lang}\n${sliced}\n\`\`\`\n`;
}
