import { parseGeneratePages } from "./directive.js";
import { GENERATE_RE } from "./scan.js";

/**
 * Replace each `{@generateGitlabPages …}` with a `<GitlabProjectGrid …/>` element.
 *
 * `linkBase` is the name of the folder the declaring page lives in; the grid uses
 * it to build each card's relative link to the generated child page
 * (`<linkBase>/<slug>`), which resolves correctly from the declaring page's URL
 * under Docusaurus's default (no-trailing-slash) doc routes.
 */
export function rewriteGeneratePages(source: string, linkBase = ""): string {
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
      `includeArchived={${spec.includeArchived}} ` +
      `linkBase="${esc(linkBase)}" />`
    );
  });
}
