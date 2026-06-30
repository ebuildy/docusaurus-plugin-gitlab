import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOptions, type PluginOptions } from "../options.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default function gitlabPlugin(_context: unknown, options: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const resolved = resolveOptions(options, mode);

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
              enforce: "pre" as const,
              use: [
                {
                  loader: path.resolve(dirname, "../include/loader.js"),
                  options: { resolved },
                },
              ],
            },
          ],
        },
      };
    },
  };
}
