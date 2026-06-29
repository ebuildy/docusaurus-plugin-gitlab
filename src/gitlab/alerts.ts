import type { Root, Element, ElementContent } from "hast";
import { toString } from "hast-util-to-string";
import { visit } from "unist-util-visit";

interface AlertType {
  defaultTitle: string;
  infimaClass: string;
}

/** GitLab alert type → default title + Docusaurus/Infima theme variant class. */
export const ALERT_TYPES: Record<string, AlertType> = {
  note: { defaultTitle: "Note", infimaClass: "alert--secondary" },
  tip: { defaultTitle: "Tip", infimaClass: "alert--success" },
  important: { defaultTitle: "Important", infimaClass: "alert--info" },
  caution: { defaultTitle: "Caution", infimaClass: "alert--warning" },
  warning: { defaultTitle: "Warning", infimaClass: "alert--danger" },
};

// Leading `[!type]` marker (case-insensitive), with optional surrounding horizontal whitespace.
const MARKER_RE = /^[^\S\r\n]*\[!(note|tip|important|caution|warning)\][^\S\r\n]*/i;

/** Build the `<p class="gitlab-md-alert-title">…</p>` title node. */
export function buildAlertTitle(title: string): ElementContent {
  return {
    type: "element",
    tagName: "p",
    properties: { className: ["gitlab-md-alert-title"] },
    children: [{ type: "text", value: title }],
  };
}

/**
 * Rehype plugin. Must run AFTER rehype-sanitize so the classes/structure it
 * injects are not stripped and the alert body is already sanitized.
 */
export function rehypeGitlabAlerts() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "blockquote") return;

      const para = node.children.find(
        (c): c is Element => c.type === "element" && c.tagName === "p",
      );
      if (!para) return;

      const first = para.children[0];
      if (!first || first.type !== "text") return;

      const match = MARKER_RE.exec(first.value);
      if (!match) return;

      const type = match[1].toLowerCase();
      const spec = ALERT_TYPES[type];
      if (!spec) return;

      // Strip the marker from the first text node; what remains is the start of
      // the title line (which may continue across following inline nodes).
      first.value = first.value.slice(match[0].length);

      // Collect the rest of the first line as the plain-text title and keep
      // everything after the first line break as the alert body.
      const titleParts: string[] = [];
      const body: ElementContent[] = [];
      let inBody = false;
      let justCrossedBreak = false;
      for (const child of para.children) {
        if (inBody) {
          // A `<br>` ending the title line is followed by a text node whose
          // leading line break belongs to the dropped break, not the body.
          if (justCrossedBreak && child.type === "text") {
            child.value = child.value.replace(/^\r?\n/, "");
          }
          justCrossedBreak = false;
          body.push(child);
          continue;
        }
        if (child.type === "element" && child.tagName === "br") {
          inBody = true; // drop the break that ends the title line
          justCrossedBreak = true;
          continue;
        }
        if (child.type === "text") {
          const nl = child.value.indexOf("\n");
          if (nl === -1) {
            titleParts.push(child.value);
          } else {
            titleParts.push(child.value.slice(0, nl));
            const rest = child.value.slice(nl + 1);
            if (rest.length > 0) body.push({ type: "text", value: rest });
            inBody = true;
          }
        } else {
          // Inline element on the title line → flatten to its text content.
          titleParts.push(toString(child));
        }
      }

      const customTitle = titleParts.join("").trim();
      const title = customTitle.length > 0 ? customTitle : spec.defaultTitle;

      para.children = body;
      // Drop the now-empty paragraph entirely.
      node.children = node.children.filter((c) => c !== para || body.length > 0);

      node.tagName = "div";
      node.properties = {
        className: [
          "gitlab-md-alert",
          `gitlab-md-alert--${type}`,
          "alert",
          spec.infimaClass,
        ],
        role: "alert",
      };
      node.children.unshift(buildAlertTitle(title));
    });
  };
}
