import type { Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

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
    .replace(/<(?![a-z/!])/gi, "&lt;");
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
