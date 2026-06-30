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

  if (!source.includes("{@includeGitlab")) {
    callback(null, source);
    return;
  }

  const options = {
    strict: resolved.strict,
    fixAutolinks: resolved.fixAutolinks,
    outProcessors: processorsId ? getOutProcessors(processorsId) : [],
  };
  transformIncludes(source, getContext(resolved), options).then(
    (out) => callback(null, out),
    (err) => callback(err instanceof Error ? err : new Error(String(err))),
  );
}
