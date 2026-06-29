import GithubSlugger from "github-slugger";
import type { Root, Element, RootContent } from "hast";
import { toString } from "hast-util-to-string";
import { visit } from "unist-util-visit";

/**
 * Token we substitute for a standalone `[[_TOC_]]` line BEFORE markdown parsing.
 * Underscores inside a word are not emphasis, so this survives the pipeline
 * intact as plain paragraph text — unlike `[[_TOC_]]`, whose underscores would
 * be parsed into `<em>`.
 */
export const TOC_PLACEHOLDER = "GITLAB_MD_TOC_PLACEHOLDER";

const HEADING_LEVELS: Record<string, number> = { h2: 2, h3: 3, h4: 4, h5: 5 };

interface TocEntry {
  level: number;
  id: string;
  text: string;
}

/**
 * Rehype plugin. Must run AFTER rehype-sanitize so the ids/anchors it generates
 * are not clobbered by the sanitize schema. No-op unless a placeholder paragraph
 * is present (keeps heading-id injection scoped to documents that use the marker).
 */
export function rehypeGitlabToc() {
  return (tree: Root) => {
    const placeholders: { parent: Root | Element; index: number }[] = [];
    visit(tree, "element", (node, index, parent) => {
      if (
        node.tagName === "p" &&
        parent &&
        typeof index === "number" &&
        toString(node).trim() === TOC_PLACEHOLDER
      ) {
        placeholders.push({ parent: parent as Root | Element, index });
      }
    });
    if (placeholders.length === 0) return;

    const slugger = new GithubSlugger();
    const entries: TocEntry[] = [];
    visit(tree, "element", (node: Element) => {
      const level = HEADING_LEVELS[node.tagName];
      if (!level) return;
      const text = toString(node).trim();
      node.properties ??= {};
      const existing = node.properties.id;
      let id: string;
      if (typeof existing === "string" && existing.length > 0) {
        id = existing;
        slugger.slug(text); // keep dedupe counter in sync
      } else {
        id = slugger.slug(text);
        node.properties.id = id;
      }
      entries.push({ level, id, text });
    });

    const nav = buildToc(entries);

    // Splice back-to-front so earlier indices stay valid.
    for (const { parent, index } of placeholders.reverse()) {
      if (nav) {
        parent.children.splice(index, 1, structuredClone(nav) as RootContent);
      } else {
        parent.children.splice(index, 1);
      }
    }
  };
}

/** Build a `<nav><ul>…</ul></nav>` nested by heading level, or null if empty. */
export function buildToc(entries: TocEntry[]): Element | null {
  if (entries.length === 0) return null;
  const minLevel = Math.min(...entries.map((e) => e.level));

  const rootList: Element = { type: "element", tagName: "ul", properties: {}, children: [] };
  const stack: { level: number; list: Element }[] = [{ level: minLevel, list: rootList }];

  for (const entry of entries) {
    const li: Element = {
      type: "element",
      tagName: "li",
      properties: {},
      children: [
        {
          type: "element",
          tagName: "a",
          properties: { href: `#${entry.id}` },
          children: [{ type: "text", value: entry.text }],
        },
      ],
    };

    while (stack.length > 1 && stack[stack.length - 1].level > entry.level) {
      stack.pop();
    }
    let top = stack[stack.length - 1];

    if (entry.level > top.level) {
      const lastLi = top.list.children[top.list.children.length - 1];
      const nestedUl: Element = { type: "element", tagName: "ul", properties: {}, children: [] };
      if (lastLi && lastLi.type === "element" && lastLi.tagName === "li") {
        lastLi.children.push(nestedUl);
      } else {
        top.list.children.push(nestedUl);
      }
      stack.push({ level: entry.level, list: nestedUl });
      top = stack[stack.length - 1];
    }

    top.list.children.push(li);
  }

  return {
    type: "element",
    tagName: "nav",
    properties: { className: ["gitlab-md-toc"] },
    children: [rootList],
  };
}
