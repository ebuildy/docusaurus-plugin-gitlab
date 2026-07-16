import type { Config } from "@docusaurus/types";
import gitlabPlugin, { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";

const gitlabOptions = {
  host: process.env.GITLAB_HOST ?? "https://gitlab.com",
  token: process.env.GITLAB_TOKEN,
  strict: true,
  stripToc: true,
};

const config: Config = {
  title: "GitLab MDX Example",
  url: "https://example.com",
  baseUrl: "/",
  favicon: undefined,
  onBrokenLinks: "ignore",
  onBrokenMarkdownLinks: "ignore",
  plugins: [[gitlabPlugin, gitlabOptions]],
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [[remarkGitlab, gitlabOptions]],
        },
        blog: false,
        theme: {
          customCss: require.resolve("@ebuildy/docusaurus-plugin-gitlab/theme.css"),
        },
      },
    ],
  ],
};

export default config;
