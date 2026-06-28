import { resolveTheme, renderThemeCss, type GitlabThemeOptions } from "./theme.js";

interface HtmlTagObject {
  tagName: string;
  attributes?: Record<string, string | boolean>;
  innerHTML?: string;
}

interface InjectedHtmlTags {
  headTags?: HtmlTagObject[];
}

interface GitlabThemePlugin {
  name: string;
  injectHtmlTags(args: { content: unknown }): InjectedHtmlTags;
}

export default function docusaurusGitlabTheme(
  _context: unknown,
  options: GitlabThemeOptions,
): GitlabThemePlugin {
  const { enabled } = resolveTheme(options);
  return {
    name: "docusaurus-plugin-gitlab-theme",
    injectHtmlTags() {
      if (!enabled) return {};
      return {
        headTags: [
          {
            tagName: "style",
            attributes: { type: "text/css" },
            innerHTML: renderThemeCss(),
          },
        ],
      };
    },
  };
}
