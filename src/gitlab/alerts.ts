import type { Root, Element, ElementContent } from "hast";
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

// Leading `[!type]` marker plus an optional same-line custom title.
// `[^\S\r\n]` = horizontal whitespace only (so we never cross into the body line).
const MARKER_RE =
  /^[^\S\r\n]*\[!(note|tip|important|caution|warning)\][^\S\r\n]*([^\r\n]*)/i;

/** Build the `<p class="gitlab-md-alert-title">…</p>` title node. */
export function buildAlertTitle(title: string): Element {
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

      const customTitle = match[2].trim();
      const title = customTitle.length > 0 ? customTitle : spec.defaultTitle;

      // Strip the marker (+ same-line title + the trailing newline) from the body.
      first.value = first.value.slice(match[0].length).replace(/^\r?\n/, "");
      if (first.value.length === 0) para.children.shift();
      if (para.children.length === 0) {
        node.children = node.children.filter((c) => c !== para);
      }

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
      node.children.unshift(buildAlertTitle(title) as ElementContent);
    });
  };
}
