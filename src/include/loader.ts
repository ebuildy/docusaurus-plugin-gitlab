import type { ResolvedOptions } from "../options.js";
import { getContext } from "./context.js";
import { transformIncludes } from "./transform.js";

interface LoaderThis {
  async: () => (err: Error | null, content?: string) => void;
  getOptions: () => { resolved: ResolvedOptions };
}

export default function gitlabIncludeLoader(this: LoaderThis, source: string): void {
  const callback = this.async();
  const { resolved } = this.getOptions();

  if (!source.includes("{@includeGitlab")) {
    callback(null, source);
    return;
  }

  transformIncludes(source, getContext(resolved), resolved).then(
    (out) => callback(null, out),
    (err) => callback(err instanceof Error ? err : new Error(String(err))),
  );
}
