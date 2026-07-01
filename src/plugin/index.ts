import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerOutProcessors } from "../include/out-processors.js";
import { resolveOptions, type PluginOptions } from "../options.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Stable, serializable ids for in-process processor registration (see below).
let processorSeq = 0;

interface PluginContextLike {
  siteDir?: string;
}

export default function gitlabPlugin(context: unknown, options: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const resolved = resolveOptions(options, mode);
  const siteDir = (context as PluginContextLike | undefined)?.siteDir ?? process.cwd();

  // User `outProcessors` are functions, which can't survive webpack's
  // serialization of loader options. Register them in-process under a plain
  // string id and pass only the id to the loader. (The built-in autolink fix is
  // driven separately by the serializable `resolved.fixAutolinks` boolean, so it
  // never depends on this registry.)
  const processorsId = `gitlab-out-${processorSeq++}`;
  registerOutProcessors(processorsId, options.outProcessors ?? []);

  return {
    name: "@ebuildy/docusaurus-plugin-gitlab",

    getClientModules() {
      // dist/plugin/index.js -> package root theme.css
      return [path.resolve(dirname, "../../theme.css")];
    },

    configureWebpack(..._args: unknown[]) {
      return {
        module: {
          rules: [
            {
              test: /\.mdx?$/,
              // Must run before Docusaurus's MDX loader: `{@includeGitlab ...}`
              // is not valid MDX, so the placeholder has to be substituted in the
              // raw source text before MDX parsing.
              enforce: "pre" as const,
              // `@docusaurus/core`'s synthetic MDX-fallback plugin
              // (server/plugins/synthetic.js) scans every `.mdx?`-matching
              // rule and flattens its `include` into the fallback rule's
              // `exclude`. Without an explicit `include` here, that flatMap
              // pushes a literal `undefined` into that array (our rule has no
              // `include` of its own) — and the webpack-merge pass that wires
              // the fallback plugin's result back into the config turns that
              // `undefined` hole into `null`, which fails webpack's own
              // config schema and aborts the build. Scoping `include` to the
              // whole site dir keeps our rule's effective reach unchanged
              // (still every `.md`/`.mdx` file in the project) while handing
              // that flatMap a real path instead of `undefined`.
              include: [siteDir],
              use: [
                {
                  loader: path.resolve(dirname, "../include/loader.js"),
                  options: { resolved, processorsId },
                },
              ],
            },
          ],
        },
        // Docusaurus merges configureWebpack() results via webpack-merge's
        // default array strategy, which deep-merges `module.rules` by index
        // instead of concatenating — `append` makes it plain-concat so other
        // plugins' rule objects pass through unchanged rather than being
        // merged with ours.
        mergeStrategy: { "module.rules": "append" },
      };
    },
  };
}
