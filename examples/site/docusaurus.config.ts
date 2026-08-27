import type { Config } from "@docusaurus/types";
import gitlabPlugin, { remarkGitlab } from "@ebuildy/docusaurus-plugin-gitlab";

const gitlabOptions = {
  host: process.env.GITLAB_HOST ?? "https://gitlab.com",
  token: process.env.GITLAB_TOKEN,
  strict: true,
  stripToc: true,
};

// The e2e test (test/e2e/build.test.ts) builds this site twice. With this flag
// set it opts into the Docusaurus v4 semantics that 3.10 already exposes:
// `v4: true` turns on removeLegacyPostBuildHeadAttribute, useCssCascadeLayers,
// siteStorageNamespacing, mdx1CompatDisabledByDefault, and fasterByDefault —
// and fasterByDefault cascades into every `faster.*` key, which is what swaps
// webpack for Rspack, Babel for SWC, and cssnano for LightningCSS.
const futureV4 = process.env.DOCUSAURUS_FUTURE_V4 === "1";

const config: Config = {
  title: "GitLab MDX Example",
  url: "https://example.com",
  // Deliberately NOT "/": localized GitLab assets are emitted site-root-relative
  // (`/gitlab-assets/…`), so a non-root baseUrl is the only thing that catches
  // them 404ing. See src/gitlab/base-url.ts and the asset-path e2e assertion.
  baseUrl: "/docs-base/",
  favicon: undefined,
  onBrokenLinks: "ignore",
  markdown: { hooks: { onBrokenMarkdownLinks: "ignore" } },
  ...(futureV4
    ? {
        future: {
          v4: true,
          // `v4: true` would also switch on Rspack's persistent cache. The
          // cascade only fills keys left undefined, so naming this one key
          // keeps every other faster.* flag at true while preventing a stale
          // bundler cache from masking the regressions this matrix exists to
          // catch. (The e2e clears the plugin's own cache between runs.)
          faster: { rspackPersistentCache: false },
        },
      }
    : {}),
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
