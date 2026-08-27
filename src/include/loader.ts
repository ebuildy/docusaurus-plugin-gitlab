import { rewriteGeneratePages } from "../generate/rewrite.js";
import { createAssetBaseUrlPrefixer, siteBaseUrl } from "../gitlab/base-url.js";
import { createHostMask } from "../gitlab/mask-host.js";
import type { ResolvedOptions } from "../options.js";
import { getContext } from "./context.js";
import { getOutProcessors } from "./out-processors.js";
import { transformIncludes } from "./transform.js";

interface LoaderThis {
  async: () => (err: Error | null, content?: string) => void;
  getOptions: () => { resolved: ResolvedOptions; processorsId?: string };
}

export default function gitlabIncludeLoader(this: LoaderThis, source: string): void {
  const callback = this.async();
  const { resolved, processorsId } = this.getOptions();
  // Directive-syntax errors here intentionally fail the build fast (unlike the
  // include path's `strict` degrade): a malformed directive is an authoring bug.
  const rewritten = rewriteGeneratePages(source);

  // Output masking for ALL page text. This is the only place every .md/.mdx in
  // the site passes through as a string, so it must wrap BOTH callbacks — the
  // fast path below skips transformIncludes entirely, and that is most files.
  const mask = createHostMask(resolved.host, resolved.gitlabPublicUrl);
  // Same choke point, same reasoning, for localized-asset URLs: `AssetManager`
  // emits them site-root-relative, so a site with a non-root `baseUrl` needs
  // the prefix baked in. See src/gitlab/base-url.ts.
  const prefixAssets = createAssetBaseUrlPrefixer(resolved.assetBaseUrl, resolved.baseUrl ?? siteBaseUrl() ?? "");
  const out = (text: string) => prefixAssets(mask(text));

  if (!rewritten.includes("{@includeGitlab")) {
    callback(null, out(rewritten));
    return;
  }

  const options = {
    strict: resolved.strict,
    fixAutolinks: resolved.fixAutolinks,
    fixVoidTags: resolved.fixVoidTags,
    fixInlineStyles: resolved.fixInlineStyles,
    convertAlerts: resolved.convertAlerts,
    stripToc: resolved.stripToc,
    allowedHosts: resolved.includeAllowedHosts,
    debug: resolved.debug,
    outProcessors: processorsId ? getOutProcessors(processorsId) : [],
  };
  transformIncludes(rewritten, getContext(resolved), options).then(
    (text) => callback(null, out(text)),
    (err) => callback(err instanceof Error ? err : new Error(String(err))),
  );
}
