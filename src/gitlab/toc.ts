import GithubSlugger from "github-slugger";
import type { Root, Element, RootContent } from "hast";
import { toString } from "hast-util-to-string";
import { visit, EXIT } from "unist-util-visit";

/**
 * Token we substitute for a standalone `[[_TOC_]]` line BEFORE markdown parsing.
 * Underscores inside a word are not emphasis, so this survives the pipeline
 * intact as plain paragraph text.
 */
export const TOC_PLACEHOLDER = "GITLAB_MD_TOC_PLACEHOLDER";

/** Where the README's table of contents is rendered. */
export type TocMode = "auto" | "inline" | "sidebar" | "hidden";

const HEADING_LEVELS: Record<string, number> = { h2: 2, h3: 3, h4: 4, h5: 5 };

export interface TocEntry {
  level: number;
  id: string;
  text: string;
}

export interface RehypeGitlabTocOptions {
  /** Defaults to "auto" (today's marker-driven behavior). */
  mode?: TocMode;
  /** When set in "sidebar" mode, collected heading entries are pushed here. */
  collect?: TocEntry[];
}

/**
 * Rehype plugin. Must run AFTER rehype-sanitize so the ids/anchors it generates
 * are not clobbered by the sanitize schema.
 *
 * - auto: today's behavior — no-op unless a `[[_TOC_]]` placeholder is present;
 *   then assign heading ids and replace the marker with an inline nav.
 * - inline: always assign ids and render the nav (at the marker if present,
 *   else above the first heading).
 * - sidebar: assign ids, strip the marker, push entries into `collect`, no nav.
 * - hidden: assign ids, strip the marker, no nav.
 */
export function rehypeGitlabToc(options: RehypeGitlabTocOptions = {}) {
  const mode: TocMode = options.mode ?? "auto";
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

    const hasMarker = placeholders.length > 0;

    // Auto mode keeps today's behavior: do nothing unless the marker is present.
    if (mode === "auto" && !hasMarker) return;

    // Assign ids to h2-h5 and collect entries (needed by every active mode).
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

    if (mode === "sidebar" && options.collect) {
      options.collect.push(...entries);
    }

    // Sidebar/hidden render no inline nav; strip the marker if present.
    if (mode === "sidebar" || mode === "hidden") {
      for (const { parent, index } of placeholders.reverse()) {
        parent.children.splice(index, 1);
      }
      return;
    }

    const nav = buildToc(entries);

    // auto-with-marker and inline-with-marker: replace the marker with the nav.
    if (hasMarker) {
      for (const { parent, index } of placeholders.reverse()) {
        if (nav) parent.children.splice(index, 1, structuredClone(nav) as RootContent);
        else parent.children.splice(index, 1);
      }
      return;
    }

    // inline without a marker: insert the nav above the first heading.
    if (nav) {
      let firstHeading: { parent: Root | Element; index: number } | null = null;
      visit(tree, "element", (n: Element, idx, parent) => {
        if (HEADING_LEVELS[n.tagName] && parent && typeof idx === "number") {
          firstHeading = { parent: parent as Root | Element, index: idx };
          return EXIT;
        }
        return undefined;
      });
      if (firstHeading !== null) {
        const target: { parent: Root | Element; index: number } = firstHeading;
        target.parent.children.splice(target.index, 0, structuredClone(nav) as RootContent);
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
