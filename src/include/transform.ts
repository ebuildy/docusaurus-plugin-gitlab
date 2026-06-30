import type { GitLabContext } from "../gitlab/fetchers.js";
import { fetchFileSource, fetchReadmeSource } from "../gitlab/fetchers.js";
import { parseInclude } from "./grammar.js";
import { applyOutProcessors, fixAutolinks, fixVoidTags, type OutProcessor } from "./out-processors.js";
import { isMarkdownSource, renderSource } from "./render-source.js";

const PLACEHOLDER_RE = /\{@(includeGitlabReadme|includeGitlabFile):([^}]+)\}/g;

export interface TransformOptions {
  strict: boolean;
  /** Prepend the built-in autolink fix to the processors applied per markdown include. */
  fixAutolinks?: boolean;
  /** Prepend the built-in void-tag fix to the processors applied per markdown include. */
  fixVoidTags?: boolean;
  /** Extra post-processors applied to the generated markdown of each markdown include. */
  outProcessors?: OutProcessor[];
}

export async function transformIncludes(
  source: string,
  ctx: GitLabContext,
  options: TransformOptions,
): Promise<string> {
  const matches = [...source.matchAll(PLACEHOLDER_RE)];
  if (matches.length === 0) return source;

  // The built-in autolink fix is driven by a serializable flag (so it reliably
  // crosses the webpack loader boundary); user processors come from the registry.
  const processors: OutProcessor[] = [
    ...(options.fixAutolinks ? [fixAutolinks] : []),
    ...(options.fixVoidTags ? [fixVoidTags] : []),
    ...(options.outProcessors ?? []),
  ];

  const seen = new Map<string, { kind: "readme" | "file"; arg: string }>();
  for (const m of matches) {
    seen.set(m[0], {
      kind: m[1] === "includeGitlabReadme" ? "readme" : "file",
      arg: m[2].trim(),
    });
  }

  // Resolve each unique placeholder once (dedupe by full match text).
  const replacements = new Map<string, string>();
  await Promise.all(
    [...seen.entries()].map(async ([full, { kind, arg }]) => {
      try {
        const spec = parseInclude(kind, arg);
        const { raw, ref } =
          kind === "readme"
            ? await fetchReadmeSource(ctx, { project: spec.project, ref: spec.ref })
            : await fetchFileSource(ctx, { project: spec.project, path: spec.path!, ref: spec.ref });
        let body = await renderSource(raw, {
          ctx,
          project: spec.project,
          ref,
          kind,
          path: spec.path,
          lineRange: spec.lineRange,
        });
        if (processors.length && isMarkdownSource(kind, spec.path)) {
          body = await applyOutProcessors(body, processors);
        }
        replacements.set(full, `\n\n${body}\n\n`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (options.strict) {
          throw new Error(`@ebuildy/docusaurus-plugin-gitlab: ${full} failed — ${message}`);
        }
        replacements.set(full, `\n\n> ⚠️ ${full} failed — ${message}\n\n`);
      }
    }),
  );

  // Single pass over the ORIGINAL source by match position — injected bodies are never re-scanned.
  let out = "";
  let last = 0;
  for (const m of matches) {
    out += source.slice(last, m.index) + replacements.get(m[0])!;
    last = (m.index ?? 0) + m[0].length;
  }
  return out + source.slice(last);
}
