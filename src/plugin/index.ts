import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateAll } from "../generate/index.js";
import { setSiteBaseUrl } from "../gitlab/base-url.js";
import { buildContext } from "../gitlab/context.js";
import { registerOutProcessors } from "../include/out-processors.js";
import { resolveOptions, type PluginOptions } from "../options.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Stable, serializable ids for in-process processor registration (see below).
let processorSeq = 0;

const generatedSites = new Set<string>();

// Generation runs once per site per process. Re-invoking the factory for the
// same siteDir (or a second plugin instance pointed at the same site) is a
// no-op — editing a {@generateGitlabPages} block during `docusaurus start`
// requires a restart to regenerate.
async function generateOnce(
  ctx: ReturnType<typeof buildContext>,
  resolved: ReturnType<typeof resolveOptions>,
  siteDir: string,
): Promise<void> {
  if (generatedSites.has(siteDir)) return;
  generatedSites.add(siteDir);
  await generateAll(ctx, path.join(siteDir, "docs"), { strict: resolved.strict });
}

interface PluginContextLike {
  siteDir?: string;
  /** Docusaurus's `LoadContext.baseUrl` — the i18n-LOCALIZED base url, which is
   *  what pages are actually served under (`siteConfig.baseUrl` is not). */
  baseUrl?: string;
}

interface CliCommandLike {
  description(text: string): CliCommandLike;
  action(fn: () => void | Promise<void>): CliCommandLike;
}

interface CliLike {
  command(name: string): CliCommandLike;
}

type ResolvedRuleOptions = ReturnType<typeof resolveOptions>;

interface IncludeLoaderRule {
  test: RegExp;
  enforce: "pre";
  include: string[];
  use: { loader: string; options: { resolved: ResolvedRuleOptions; processorsId: string } }[];
}

/**
 * Builds the webpack `module.rules` entry that registers the `{@includeGitlab...}`
 * pre-loader.
 *
 * Kept as a pure function, separate from the `configureWebpack` hook, because
 * Docusaurus v4 deprecates `configureWebpack(...args)` in favour of
 * `configureBundler({...})`. When that signature is finally published, the swap
 * is a new wrapper around this function rather than surgery on the hook body.
 * See `docs/superpowers/specs/2026-08-25-docusaurus-4-support-design.md`.
 */
function buildIncludeLoaderRule(args: {
  siteDir: string;
  resolved: ResolvedRuleOptions;
  processorsId: string;
}): IncludeLoaderRule {
  const { siteDir, resolved, processorsId } = args;
  return {
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
  };
}

export default async function gitlabPlugin(context: unknown, options: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const resolved = resolveOptions(options, mode);
  const loadContext = context as PluginContextLike | undefined;
  const providedSiteDir = loadContext?.siteDir;
  const siteDir = providedSiteDir ?? process.cwd();

  // Publish the site's baseUrl for the remark plugin, which is handed no
  // LoadContext of its own. Plugin loading runs strictly before MDX
  // compilation, so the value is in place by the time a transformer reads it.
  // See src/gitlab/base-url.ts.
  if (loadContext?.baseUrl !== undefined) setSiteBaseUrl(loadContext.baseUrl);

  // User `outProcessors` are functions, which can't survive webpack's
  // serialization of loader options. Register them in-process under a plain
  // string id and pass only the id to the loader. (The built-in autolink fix is
  // driven separately by the serializable `resolved.fixAutolinks` boolean, so it
  // never depends on this registry.)
  const processorsId = `gitlab-out-${processorSeq++}`;
  registerOutProcessors(processorsId, options.outProcessors ?? []);

  const ctx = buildContext(resolved);

  // Localized README images are written into `assetDir` (under `static/`) while
  // webpack compiles, but Docusaurus decides whether to copy the static
  // directories at all when it CREATES the webpack config — a dir that is
  // missing or empty at that moment is silently skipped, so on a first build of
  // a site with no other static files the images never reach `build/`. This
  // factory runs during plugin loading, comfortably before that snapshot, so
  // materializing the dir here closes the window (the remark plugin does the
  // same, but only once compilation is already under way). Best-effort: a site
  // that never localizes an asset must not fail to build over an unwritable dir
  // — a real download still surfaces the error.
  await ctx.assets.sync().catch(() => {});

  // Generate pages before Docusaurus's docs plugin scans the filesystem, so the
  // generated tree + `_category_.json` files feed the autogenerated sidebar. Only
  // run when Docusaurus actually provided a siteDir — a bare cwd fallback would
  // scan an unrelated tree (and is what real Docusaurus never does).
  if (providedSiteDir) {
    await generateOnce(ctx, resolved, providedSiteDir);
  }

  return {
    name: "@ebuildy/docusaurus-plugin-gitlab",

    getClientModules() {
      // dist/plugin/index.js -> package root theme.css
      return [path.resolve(dirname, "../../theme.css")];
    },

    extendCli(cli: CliLike) {
      cli
        .command("gitlab:generate")
        .description("Generate Docusaurus pages from GitLab groups (@ebuildy/docusaurus-plugin-gitlab)")
        .action(async () => {
          await generateOnce(ctx, resolved, siteDir);
        });
    },

    configureWebpack(..._args: unknown[]) {
      return {
        module: {
          rules: [buildIncludeLoaderRule({ siteDir, resolved, processorsId })],
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
