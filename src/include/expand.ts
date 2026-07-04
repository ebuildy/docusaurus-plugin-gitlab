// These imports are used by later tasks (Task 3+); kept here for code organization
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { fetchFileSource } from "../gitlab/fetchers.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { GitLabContext } from "../gitlab/fetchers.js";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { codeRanges, stripFrontmatter } from "./render-source.js";

/** Markdown file extensions whose content is expanded recursively as markdown. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MD_EXT = /\.(?:md|mdx|markdown)$/i;

/** Extract the `file=` value from a `::include{…}` attribute string (bare or quoted). */
export function parseIncludeAttrs(attrs: string): { file?: string } {
  const m = /(?:^|\s)file\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(attrs);
  if (!m) return {};
  return { file: m[1] ?? m[2] ?? m[3] };
}
