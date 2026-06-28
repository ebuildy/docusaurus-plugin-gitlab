import { createRequire } from "node:module";
import type { Config } from "@docusaurus/types";
import { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";

const require = createRequire(import.meta.url);

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
                // Live data: tolerate transient API/rate-limit issues by rendering
                // a fallback instead of failing the build.
                strict: false,
              },
            ],
          ],
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
