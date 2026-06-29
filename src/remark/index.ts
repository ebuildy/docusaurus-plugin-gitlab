import { visit } from "unist-util-visit";
import { AssetManager } from "../gitlab/assets.js";
import { FileCache } from "../gitlab/cache.js";
import { GitLabClient } from "../gitlab/client.js";
import type { GitLabContext } from "../gitlab/fetchers.js";
import { resolveOptions, type PluginOptions } from "../options.js";
import { parseAttributes } from "./attributes.js";
import { injectProp } from "./inject.js";
import { COMPONENT_REGISTRY } from "./registry.js";
import { mergeReadmeTocs } from "./toc-export.js";

const CACHE_DIR = "node_modules/.cache/@ebuildy/docusaurus-plugin-gitlab";

function buildContext(options: ReturnType<typeof resolveOptions>): GitLabContext {
  const client = new GitLabClient({ host: options.host, token: options.token });
  const cache = new FileCache(CACHE_DIR, options.cache);
  const assets = new AssetManager({
    client,
    cache,
    assetDir: options.assetDir,
    assetBaseUrl: options.assetBaseUrl,
    host: options.host,
  });
  return { client, cache, assets, options: { host: options.host } };
}

export default function remarkGitlab(rawOptions: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const options = resolveOptions(rawOptions, mode);
  const ctx = buildContext(options);

  return async function transformer(tree: any, file: any) {
    const jobs: { node: any }[] = [];
    visit(tree, (node: any) => {
      if (
        (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
        node.name &&
        COMPONENT_REGISTRY[node.name]
      ) {
        jobs.push({ node });
      }
    });

    const sidebarReadmes: { node: any; entries: any[] }[] = [];

    await Promise.all(
      jobs.map(async ({ node }) => {
        const fetcher = COMPONENT_REGISTRY[node.name];
        const filePath = file?.path ?? "unknown.mdx";
        const attrs = parseAttributes(node.attributes ?? [], filePath);
        try {
          const data = await fetcher(ctx, attrs);
          injectProp(node, "data", data);
          if (node.name === "GitlabReadme" && Array.isArray((data as any)?.toc)) {
            sidebarReadmes.push({ node, entries: (data as any).toc });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const where = node.position?.start
            ? `${filePath}:${node.position.start.line}:${node.position.start.column}`
            : filePath;
          if (options.strict) {
            throw new Error(`@ebuildy/docusaurus-plugin-gitlab: <${node.name}> failed at ${where} — ${message}`);
          }
          injectProp(node, "error", { message, project: String(attrs.project ?? "") });
        }
      }),
    );

    mergeReadmeTocs(tree, sidebarReadmes);
  };
}
