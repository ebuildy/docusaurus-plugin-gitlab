import Joi from "joi";
import type { OutProcessor } from "./include/out-processors.js";

export interface PluginOptions {
  host: string;
  token?: string;
  strict?: boolean;
  cache?: { ttl: number } | false;
  assetDir?: string;
  assetBaseUrl?: string;
  /** Convert CommonMark autolinks (`<https://…>`, `<a@b.com>`) in included markdown
   *  to MDX-safe links so they don't break the build. Default: `true`. */
  fixAutolinks?: boolean;
  /** Self-close HTML void elements (`<br>` → `<br/>`) in included markdown so MDX
   *  accepts them. Default: `true`. */
  fixVoidTags?: boolean;
  /** Convert HTML string `style="…"` attributes in included markdown into JSX style
   *  objects (`style={{ … }}`) so MDX/React accepts them. Default: `true`. */
  fixInlineStyles?: boolean;
  /** Translate GitLab/GitHub alert blockquotes (`> [!note]`) in included markdown
   *  into native Docusaurus admonitions (`:::note … :::`). Default: `true`. */
  convertAlerts?: boolean;
  /** Remove a redundant "Table of Contents" section (and any `[[_TOC_]]` marker)
   *  from included markdown — Docusaurus renders its own. Default: `false`. */
  stripToc?: boolean;
  /** Hostnames (exact, case-insensitive) allowed as remote `::include{file=https://…}`
   *  targets inside fetched GitLab markdown. Empty ⇒ remote includes are rejected.
   *  Default: `[]`. */
  includeAllowedHosts?: string[];
  /** Extra post-processors applied to the markdown generated from includes,
   *  in order, after the built-in fixes (when enabled). */
  outProcessors?: OutProcessor[];
}

export interface ResolvedOptions {
  host: string;
  token?: string;
  strict: boolean;
  cache: { ttl: number } | false;
  assetDir: string;
  assetBaseUrl: string;
  fixAutolinks: boolean;
  fixVoidTags: boolean;
  fixInlineStyles: boolean;
  convertAlerts: boolean;
  stripToc: boolean;
  includeAllowedHosts: string[];
}

const schema = Joi.object({
  // Docusaurus injects `id` into every plugin's options object before calling
  // the plugin function (see @docusaurus/core's `doValidatePluginOptions`),
  // even when the plugin doesn't declare a `validateOptions` hook. Accept and
  // ignore it so the plugin works when registered via the top-level `plugins`
  // array, not just via the (separately validated) `remarkGitlab` entry.
  id: Joi.string().optional(),
  host: Joi.string().uri().required(),
  token: Joi.string().allow("").optional(),
  strict: Joi.boolean().optional(),
  cache: Joi.alternatives(Joi.object({ ttl: Joi.number().min(0).required() }), Joi.boolean().valid(false)).optional(),
  assetDir: Joi.string().optional(),
  assetBaseUrl: Joi.string().optional(),
  fixAutolinks: Joi.boolean().optional(),
  fixVoidTags: Joi.boolean().optional(),
  fixInlineStyles: Joi.boolean().optional(),
  convertAlerts: Joi.boolean().optional(),
  stripToc: Joi.boolean().optional(),
  includeAllowedHosts: Joi.array().items(Joi.string()).optional(),
  outProcessors: Joi.array().items(Joi.function()).optional(),
});

export function resolveOptions(
  input: PluginOptions,
  mode: "production" | "development" = "production",
): ResolvedOptions {
  const { error, value } = schema.validate(input, { abortEarly: false });
  if (error) throw new Error(`@ebuildy/docusaurus-plugin-gitlab: invalid options — ${error.message}`);

  const opts = value as PluginOptions;
  return {
    host: opts.host.replace(/\/+$/, ""),
    token: opts.token || undefined,
    strict: opts.strict ?? mode === "production",
    cache: opts.cache === undefined ? { ttl: 3600 } : opts.cache,
    assetDir: opts.assetDir ?? "static/gitlab-assets",
    assetBaseUrl: (opts.assetBaseUrl ?? "/gitlab-assets").replace(/\/+$/, ""),
    fixAutolinks: opts.fixAutolinks ?? true,
    fixVoidTags: opts.fixVoidTags ?? true,
    fixInlineStyles: opts.fixInlineStyles ?? true,
    convertAlerts: opts.convertAlerts ?? true,
    stripToc: opts.stripToc ?? false,
    includeAllowedHosts: opts.includeAllowedHosts ?? [],
  };
}
