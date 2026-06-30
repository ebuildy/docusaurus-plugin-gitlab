import type { GitLabContext } from "../gitlab/fetchers.js";
import { fetchFileSource, fetchReadmeSource } from "../gitlab/fetchers.js";
import type { ResolvedOptions } from "../options.js";
import { parseInclude } from "./grammar.js";
import { renderSource } from "./render-source.js";

const PLACEHOLDER_RE = /\{@(includeGitlabReadme|includeGitlabFile):([^}]+)\}/g;

export async function transformIncludes(
  source: string,
  ctx: GitLabContext,
  options: Pick<ResolvedOptions, "strict">,
): Promise<string> {
  const seen = new Map<string, { kind: "readme" | "file"; arg: string }>();
  for (const m of source.matchAll(PLACEHOLDER_RE)) {
    seen.set(m[0], {
      kind: m[1] === "includeGitlabReadme" ? "readme" : "file",
      arg: m[2].trim(),
    });
  }
  if (seen.size === 0) return source;

  const entries = await Promise.all(
    [...seen.entries()].map(async ([full, { kind, arg }]) => {
      try {
        const spec = parseInclude(kind, arg);
        const { raw, ref } =
          kind === "readme"
            ? await fetchReadmeSource(ctx, { project: spec.project, ref: spec.ref })
            : await fetchFileSource(ctx, { project: spec.project, path: spec.path!, ref: spec.ref });
        const body = await renderSource(raw, {
          ctx,
          project: spec.project,
          ref,
          kind,
          path: spec.path,
          lineRange: spec.lineRange,
        });
        return [full, `\n\n${body}\n\n`] as const;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (options.strict) {
          throw new Error(`@ebuildy/docusaurus-plugin-gitlab: ${full} failed — ${message}`);
        }
        return [full, `\n\n> ⚠️ ${full} failed — ${message}\n\n`] as const;
      }
    }),
  );

  let out = source;
  for (const [full, text] of entries) out = out.split(full).join(text);
  return out;
}
