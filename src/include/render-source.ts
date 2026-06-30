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
