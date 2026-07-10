import { parseGeneratePages } from "./directive.js";
import { GENERATE_RE } from "./scan.js";

/** Replace each `{@generateGitlabPages …}` with a `<GitlabProjectGrid …/>` element. */
export function rewriteGeneratePages(source: string): string {
  if (!source.includes("{@generateGitlabPages")) return source;
  const esc = (v: string) => v.replace(/"/g, "&quot;");
  return source.replace(GENERATE_RE, (_full, attrs: string) => {
    const spec = parseGeneratePages(attrs);
    return (
      `<GitlabProjectGrid ` +
      `group="${esc(spec.group)}" ` +
      `sections="${esc(spec.sections.join(","))}" ` +
      `topics="${esc(spec.topics.join(","))}" ` +
      `includeSubgroups={${spec.includeSubgroups}} ` +
      `includeArchived={${spec.includeArchived}} />`
    );
  });
}
