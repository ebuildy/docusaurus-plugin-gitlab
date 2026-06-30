import { buildContext } from "../gitlab/context.js";
import type { GitLabContext } from "../gitlab/fetchers.js";
import type { ResolvedOptions } from "../options.js";

const contexts = new Map<string, GitLabContext>();

/** One context per distinct resolved-options set, reused across loader calls. */
export function getContext(resolved: ResolvedOptions): GitLabContext {
  const key = JSON.stringify(resolved);
  let ctx = contexts.get(key);
  if (!ctx) {
    ctx = buildContext(resolved);
    contexts.set(key, ctx);
  }
  return ctx;
}
