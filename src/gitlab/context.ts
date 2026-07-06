import type { PluggableList } from "unified";
import type { ResolvedOptions } from "../options.js";
import { AssetManager } from "./assets.js";
import { FileCache } from "./cache.js";
import { GitLabClient } from "./client.js";
import type { GitLabContext } from "./fetchers.js";
import { chainHasSanitize } from "./markdown.js";

export const CACHE_DIR = "node_modules/.cache/@ebuildy/docusaurus-plugin-gitlab";

type WarnLogger = { warn: (message: string) => void };

/**
 * Emit a build-time warning when a user-supplied `markdownRenderChain` omits
 * `rehype-sanitize`, so untrusted GitLab content rendered without sanitization
 * is surfaced loudly. `@docusaurus/logger` is imported lazily (optional peer),
 * matching `src/include/logger.ts`.
 */
export async function warnIfChainMissingSanitize(chain: PluggableList): Promise<void> {
  if (chainHasSanitize(chain)) return;
  const imported = (await import("@docusaurus/logger")).default as unknown as WarnLogger & {
    default?: WarnLogger;
  };
  const logger: WarnLogger = imported.default ?? imported;
  logger.warn(
    "@ebuildy/docusaurus-plugin-gitlab: markdownRenderChain has no rehype-sanitize — " +
      "untrusted GitLab content will be rendered without sanitization.",
  );
}

export function buildContext(options: ResolvedOptions): GitLabContext {
  const client = new GitLabClient({ host: options.host, token: options.token });
  const cache = new FileCache(CACHE_DIR, options.cache);
  const assets = new AssetManager({
    client,
    cache,
    assetDir: options.assetDir,
    assetBaseUrl: options.assetBaseUrl,
    host: options.host,
  });
  if (options.markdownRenderChain) void warnIfChainMissingSanitize(options.markdownRenderChain);
  return {
    client,
    cache,
    assets,
    options: {
      host: options.host,
      strict: options.strict,
      allowedHosts: options.includeAllowedHosts,
      debug: options.debug,
      markdownRenderChain: options.markdownRenderChain,
    },
  };
}
