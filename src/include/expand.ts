import { languageFromPath } from "../gitlab/code.js";
import { fetchFileSource } from "../gitlab/fetchers.js";
import type { GitLabContext } from "../gitlab/fetchers.js";
import type { IncludeLogger } from "./logger.js";
import type { OutProcessor } from "./out-processors.js";
import { codeRanges, stripFrontmatter } from "./render-source.js";

/** Markdown file extensions whose content is expanded recursively as markdown. */
const MD_EXT = /\.(?:md|mdx|markdown)$/i;

/** Maximum nesting depth for recursive `::include` expansion. */
export const MAX_INCLUDE_DEPTH = 8;

/** Extract the `file=` value from a `::include{…}` attribute string (bare or quoted). */
export function parseIncludeAttrs(attrs: string): { file?: string } {
  const m = /(?:^|\s)file\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(attrs);
  if (!m) return {};
  return { file: m[1] ?? m[2] ?? m[3] };
}

export interface ExpandContext {
  ctx: GitLabContext;
  project: string;
  ref: string;
  allowedHosts: string[];
  strict: boolean;
  /** Optional debug logger; when present, each resolved directive is traced. */
  log?: IncludeLogger;
}

export interface ExpandGuard {
  depth: number;
  stack: Set<string>;
}

/** A standalone `::include{…}` leaf directive occupying its own line. */
const INCLUDE_RE = /^[ \t]*::include\{([^}\n]*)\}[ \t]*$/gm;

/** Resolve a directive's target to raw text plus a cycle key and markdown flag. */
async function resolveTarget(
  file: string,
  o: ExpandContext,
): Promise<{ raw: string; key: string; isMarkdown: boolean }> {
  if (/^https?:\/\//i.test(file)) {
    const url = new URL(file);
    if (!o.allowedHosts.some((h) => h.toLowerCase() === url.host.toLowerCase())) {
      throw new Error(`::include host not allowed: ${url.host}`);
    }
    const res = await fetch(url, { redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`::include remote redirect blocked: ${url.href} → ${res.status}`);
    }
    if (!res.ok) throw new Error(`fetch ${url.href} → HTTP ${res.status}`);
    return { raw: await res.text(), key: url.href, isMarkdown: MD_EXT.test(url.pathname) };
  }
  const key = `${o.project}@${o.ref}/-/${file}`;
  const src = await fetchFileSource(o.ctx, { project: o.project, path: file, ref: o.ref });
  return { raw: src.raw, key, isMarkdown: MD_EXT.test(file) };
}

/** Resolve a single directive to its replacement text, honoring `strict`. */
async function resolveOne(
  full: string,
  attrs: string,
  o: ExpandContext,
  guard: ExpandGuard,
): Promise<string> {
  try {
    const { file } = parseIncludeAttrs(attrs);
    if (!file) throw new Error("::include missing file= attribute");
    const { raw, key, isMarkdown } = await resolveTarget(file, o);
    o.log?.debug(
      `::include ${file} → ${key} ` +
        `[depth ${guard.depth}, ${isMarkdown ? "markdown, expanding" : `code:${languageFromPath(file)}`}, ${raw.length} bytes]`,
    );
    if (guard.stack.has(key)) throw new Error(`::include cycle detected: ${key}`);
    // Non-markdown targets are spliced as a fenced, syntax-highlighted code block
    // (like `{@includeGitlabFile}` of a code file) rather than as raw prose — raw
    // YAML/JSON/etc. would otherwise render as garbled markdown.
    if (!isMarkdown) return `\n\`\`\`${languageFromPath(file)}\n${raw}\n\`\`\`\n`;
    const body = stripFrontmatter(raw);
    return expandFileIncludes(body, o, {
      depth: guard.depth + 1,
      stack: new Set(guard.stack).add(key),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (o.strict) {
      throw new Error(`@ebuildy/docusaurus-plugin-gitlab: ${full} failed — ${message}`);
    }
    return `\n\n> ⚠️ ${full} failed — ${message}\n\n`;
  }
}

/**
 * Replace every standalone `::include{file=…}` directive in `md` (outside code
 * regions) with the raw content of its target. `guard` carries recursion state.
 */
export async function expandFileIncludes(
  md: string,
  o: ExpandContext,
  guard: ExpandGuard,
): Promise<string> {
  if (guard.depth > MAX_INCLUDE_DEPTH) {
    throw new Error(`::include exceeded max depth (${MAX_INCLUDE_DEPTH})`);
  }
  const ranges = codeRanges(md);
  const inCode = (i: number) => ranges.some(([s, e]) => i >= s && i < e);

  const matches = [...md.matchAll(INCLUDE_RE)].filter((m) => !inCode(m.index ?? 0));
  if (matches.length === 0) return md;

  const replacements = await Promise.all(
    matches.map((m) => resolveOne(m[0], m[1], o, guard)),
  );

  let out = "";
  let last = 0;
  matches.forEach((m, i) => {
    out += md.slice(last, m.index) + replacements[i];
    last = (m.index ?? 0) + m[0].length;
  });
  return out + md.slice(last);
}

/** Configuration for the {@link expandIncludes} source processor. */
export interface ExpandConfig {
  ctx: GitLabContext;
  project: string;
  ref: string;
  /** Path of the host include (a markdown file), or undefined for a README. Seeds
   *  cycle detection so a nested include can't re-enter the host document. */
  path?: string;
  allowedHosts: string[];
  strict: boolean;
  /** Optional debug logger; traces each resolved `::include` directive. */
  log?: IncludeLogger;
}

/**
 * Build a pre-render source processor that expands GitLab `::include{file=…}`
 * directives in raw fetched markdown, against the given project/ref. It runs
 * *before* `renderSource` — the directive's `{…}` braces would be MDX-escaped
 * afterward — and reuses the {@link OutProcessor} shape so it composes with the
 * post-render processor chain via `applyOutProcessors`.
 */
export function expandIncludes(config: ExpandConfig): OutProcessor {
  const o: ExpandContext = {
    ctx: config.ctx,
    project: config.project,
    ref: config.ref,
    allowedHosts: config.allowedHosts,
    strict: config.strict,
    log: config.log,
  };
  const seed = `${config.project}@${config.ref}/-/${config.path ?? "README.md"}`;
  return (md) => expandFileIncludes(md, o, { depth: 0, stack: new Set([seed]) });
}
