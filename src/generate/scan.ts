import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseGeneratePages, type GeneratePagesSpec } from "./directive.js";

/** Global matcher for the directive; capture group 1 is the attribute string. */
export const GENERATE_RE = /\{@generateGitlabPages\s([^}]*)\}/g;

export interface GeneratePagesHit {
  file: string;
  spec: GeneratePagesSpec;
  /** Directory the generated tree is written into (`<fileDir>/<basePath>`). */
  targetDir: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.mdx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function scanGeneratePages(docsDir: string): GeneratePagesHit[] {
  if (!existsSync(docsDir)) return [];
  const hits: GeneratePagesHit[] = [];
  for (const file of walk(docsDir)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("{@generateGitlabPages")) continue;
    for (const m of source.matchAll(GENERATE_RE)) {
      const spec = parseGeneratePages(m[1]);
      hits.push({ file, spec, targetDir: join(dirname(file), spec.basePath) });
    }
  }
  return hits;
}
