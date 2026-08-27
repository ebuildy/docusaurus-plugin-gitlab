import Joi from "joi";
import type { PluggableList } from "unified";
import { normalizeBaseUrl } from "./gitlab/base-url.js";
import type { LinkMode } from "./gitlab/links.js";
import type { OutProcessor } from "./include/out-processors.js";

export interface PluginOptions {
  host: string;
  token?: string;
  strict?: boolean;
  cache?: { ttl: number } | false;
  assetDir?: string;
  assetBaseUrl?: string;
  /** The site's Docusaurus `baseUrl`, prefixed onto every localized-asset URL so
   *  images resolve on a site that is not served from `/`. Auto-detected from
   *  the Docusaurus plugin's `LoadContext`; set it explicitly only when
   *  `remarkGitlab` is registered WITHOUT the Docusaurus plugin. Default: the
   *  detected value, else `"/"`. */
  baseUrl?: string;
  /** Public GitLab base URL used to build links to repository files. Defaults to
   *  `host`. Set it when the build-time API host differs from the user-facing
   *  URL (e.g. an internal hostname behind a reverse proxy). */
  publicUrl?: string;
  /** Public GitLab base URL substituted for `host` in every build output
   *  string — component props, rendered HTML, and the plain text of every page.
   *  Empty ⇒ no substitution. Distinct from `publicUrl`, which only decides
   *  where relative links point and may be a non-GitLab URL. Output masking
   *  only: the host still appears in build logs and in the on-disk cache.
   *  Default: `""`. */
  gitlabPublicUrl?: string;
  /** Where relative links in fetched markdown should point: `"gitlab"` (absolute
   *  blob URLs), `"site"` (site-internal paths, `.md` stripped, prefixed with
   *  `linkBase`), or `"keep"` (untouched). Default: `"gitlab"`. Overridable per
   *  component with the `relativeLinks` attribute. */
  relativeLinks?: LinkMode;
  /** Site path the mirrored docs tree is mounted at, used by
   *  `relativeLinks: "site"`. Default: `""` (site root). Overridable per
   *  component with the `linkBase` attribute. */
  linkBase?: string;
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
  /** Emit build-time debug traces for the include pipeline (each resolved
   *  placeholder and `::include` directive) via `@docusaurus/logger`.
   *  Default: `false`. */
  debug?: boolean;
  /** Extra post-processors applied to the markdown generated from includes,
   *  in order, after the built-in fixes (when enabled). */
  outProcessors?: OutProcessor[];
  /** Replaces the default markdown→sanitized-hast plugin chain used to render
   *  fetched GitLab markdown (descriptions, release notes, READMEs, files).
   *  Defaults to `defaultMarkdownRenderChain`. Omitting `rehype-sanitize`
   *  disables sanitization of untrusted content (a build warning is emitted). */
  markdownRenderChain?: PluggableList;
}

export interface ResolvedOptions {
  host: string;
  token?: string;
  strict: boolean;
  cache: { ttl: number } | false;
  assetDir: string;
  assetBaseUrl: string;
  /** `undefined` ⇒ not set by the author; fall back to the value the Docusaurus
   *  plugin reported. Normalized: no trailing slash, `""` at the site root. */
  baseUrl: string | undefined;
  publicUrl: string;
  gitlabPublicUrl: string;
  relativeLinks: LinkMode;
  linkBase: string;
  fixAutolinks: boolean;
  fixVoidTags: boolean;
  fixInlineStyles: boolean;
  convertAlerts: boolean;
  stripToc: boolean;
  includeAllowedHosts: string[];
  debug: boolean;
  markdownRenderChain?: PluggableList;
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
  baseUrl: Joi.string().allow("").optional(),
  publicUrl: Joi.string().uri().optional(),
  gitlabPublicUrl: Joi.string().uri().allow("").optional(),
  relativeLinks: Joi.string().valid("gitlab", "keep", "site").optional(),
  linkBase: Joi.string().allow("").optional(),
  fixAutolinks: Joi.boolean().optional(),
  fixVoidTags: Joi.boolean().optional(),
  fixInlineStyles: Joi.boolean().optional(),
  convertAlerts: Joi.boolean().optional(),
  stripToc: Joi.boolean().optional(),
  includeAllowedHosts: Joi.array().items(Joi.string()).optional(),
  debug: Joi.boolean().optional(),
  outProcessors: Joi.array().items(Joi.function()).optional(),
  markdownRenderChain: Joi.array().items(Joi.alternatives(Joi.function(), Joi.array())).optional(),
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
    baseUrl: opts.baseUrl === undefined ? undefined : normalizeBaseUrl(opts.baseUrl),
    publicUrl: (opts.publicUrl ?? opts.host).replace(/\/+$/, ""),
    // Deliberately NOT `?? opts.host` — that would make the option a permanent
    // no-op. Empty is the documented "off".
    gitlabPublicUrl: (opts.gitlabPublicUrl ?? "").replace(/\/+$/, ""),
    relativeLinks: opts.relativeLinks ?? "gitlab",
    linkBase: (opts.linkBase ?? "").replace(/\/+$/, ""),
    fixAutolinks: opts.fixAutolinks ?? true,
    fixVoidTags: opts.fixVoidTags ?? true,
    fixInlineStyles: opts.fixInlineStyles ?? true,
    convertAlerts: opts.convertAlerts ?? true,
    stripToc: opts.stripToc ?? false,
    includeAllowedHosts: opts.includeAllowedHosts ?? [],
    debug: opts.debug ?? false,
    // Read from the original `input` (not Joi's validated `value`) so the
    // caller's array/function references are preserved — Joi clones arrays
    // during validation, which would break identity for consumers that rely
    // on `===` (e.g. memoization keyed on the chain reference).
    markdownRenderChain: input.markdownRenderChain,
  };
}
