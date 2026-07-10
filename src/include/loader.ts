import { basename, dirname } from "node:path";
import { rewriteGeneratePages } from "../generate/rewrite.js";
import type { ResolvedOptions } from "../options.js";
import { getContext } from "./context.js";
import { getOutProcessors } from "./out-processors.js";
import { transformIncludes } from "./transform.js";

interface LoaderThis {
  async: () => (err: Error | null, content?: string) => void;
  getOptions: () => { resolved: ResolvedOptions; processorsId?: string };
  /** Absolute path of the file being compiled (provided by webpack). */
  resourcePath?: string;
}

export default function gitlabIncludeLoader(this: LoaderThis, source: string): void {
  const callback = this.async();
  const { resolved, processorsId } = this.getOptions();
  // The declaring page's folder name; the project grid builds card links relative
  // to it (`<linkBase>/<slug>`) so they resolve to the generated child pages.
  const linkBase = this.resourcePath ? basename(dirname(this.resourcePath)) : "";
  // Directive-syntax errors here intentionally fail the build fast (unlike the
  // include path's `strict` degrade): a malformed directive is an authoring bug.
  const rewritten = rewriteGeneratePages(source, linkBase);

  if (!rewritten.includes("{@includeGitlab")) {
    callback(null, rewritten);
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
    (out) => callback(null, out),
    (err) => callback(err instanceof Error ? err : new Error(String(err))),
  );
}
