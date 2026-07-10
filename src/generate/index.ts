import type { GitLabContext } from "../gitlab/fetchers.js";
import { fetchGroupProjects } from "../gitlab/fetchers.js";
import { scanGeneratePages } from "./scan.js";
import { writeProjectPages } from "./write.js";

export interface GenerateResult {
  directives: number;
  pagesWritten: number;
}

export interface GenerateOptions {
  /** In strict mode a failed hit rethrows (aborts the build); otherwise it is skipped. */
  strict: boolean;
}

export async function generateAll(
  ctx: GitLabContext,
  docsDir: string,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const hits = scanGeneratePages(docsDir);
  let pagesWritten = 0;
  for (const hit of hits) {
    const { spec } = hit;
    try {
      const projects = await fetchGroupProjects(ctx, {
        group: spec.group,
        includeSubgroups: spec.includeSubgroups,
        includeArchived: spec.includeArchived,
        topics: spec.topics,
      });
      const written = writeProjectPages(projects, {
        targetDir: hit.targetDir,
        sections: spec.sections,
      });
      pagesWritten += written.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (opts.strict) {
        throw new Error(
          `@ebuildy/docusaurus-plugin-gitlab: {@generateGitlabPages group=${spec.group}} in ${hit.file} failed — ${message}`,
        );
      }
      console.warn(
        `@ebuildy/docusaurus-plugin-gitlab: skipping {@generateGitlabPages group=${spec.group}} in ${hit.file} — ${message}`,
      );
    }
  }
  return { directives: hits.length, pagesWritten };
}
