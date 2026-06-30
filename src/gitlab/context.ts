import type { ResolvedOptions } from "../options.js";
import { AssetManager } from "./assets.js";
import { FileCache } from "./cache.js";
import { GitLabClient } from "./client.js";
import type { GitLabContext } from "./fetchers.js";

export const CACHE_DIR = "node_modules/.cache/@ebuildy/docusaurus-plugin-gitlab";

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
  return { client, cache, assets, options: { host: options.host } };
}
