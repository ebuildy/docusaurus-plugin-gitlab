import { createRequire } from "node:module";
import type { Config } from "@docusaurus/types";
import gitlabPlugin, { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";

const require = createRequire(import.meta.url);

// Live data: tolerate transient API/rate-limit issues by rendering a fallback
// (for the JSX components) / inline warning (for include placeholders) instead
// of failing the build. Shared by the remark plugin and the Docusaurus plugin.
const gitlabOptions = {
  host: process.env.GITLAB_HOST ?? "https://gitlab.com",
  token: process.env.GITLAB_TOKEN,
  strict: false,
  stripToc: true,
  debug: true,
};

// Live example: embeds REAL public content from gitlab.com.
// No token is required for these public projects, but you can set GITLAB_TOKEN
// to raise the API rate limit (unauthenticated is 500 req/min).
const config: Config = {
  title: "GitLab MDX — live examples",
  url: "https://example.com",
  baseUrl: "/",
  favicon: undefined,
  onBrokenLinks: "ignore",
  onBrokenMarkdownLinks: "ignore",
  // The Docusaurus plugin powers the {@includeGitlabReadme} / {@includeGitlabFile}
  // placeholders; the remark plugin below powers the <Gitlab*> JSX components.
  plugins: [[gitlabPlugin, gitlabOptions]],
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          remarkPlugins: [remarkGfm, remarkGemoji, [remarkGitlab, gitlabOptions]],
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
