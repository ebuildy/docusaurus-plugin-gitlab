import Joi from "joi";

export interface PluginOptions {
  host: string;
  token?: string;
  strict?: boolean;
  cache?: { ttl: number } | false;
  assetDir?: string;
  assetBaseUrl?: string;
}

export interface ResolvedOptions {
  host: string;
  token?: string;
  strict: boolean;
  cache: { ttl: number } | false;
  assetDir: string;
  assetBaseUrl: string;
}

const schema = Joi.object({
  host: Joi.string().uri().required(),
  token: Joi.string().allow("").optional(),
  strict: Joi.boolean().optional(),
  cache: Joi.alternatives(Joi.object({ ttl: Joi.number().min(0).required() }), Joi.boolean().valid(false)).optional(),
  assetDir: Joi.string().optional(),
  assetBaseUrl: Joi.string().optional(),
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
  };
}
