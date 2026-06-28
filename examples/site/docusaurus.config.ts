import type { Config } from "@docusaurus/types";
import { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";
import docusaurusGitlabTheme from "@ebuildy/docusaurus-plugin-gitlab/plugin";

const config: Config = {
  title: "GitLab MDX Example",
  url: "https://example.com",
  baseUrl: "/",
  favicon: undefined,
  onBrokenLinks: "ignore",
  onBrokenMarkdownLinks: "ignore",
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [
            [
              remarkGitlab,
              {
                host: process.env.GITLAB_HOST ?? "https://gitlab.com",
                token: process.env.GITLAB_TOKEN,
                strict: true,
              },
            ],
          ],
        },
        blog: false,
        theme: {},
      },
    ],
  ],
  plugins: [[docusaurusGitlabTheme, { theme: true }]],
};

export default config;
