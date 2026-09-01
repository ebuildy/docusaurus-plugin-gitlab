export interface IncludeSpec {
  kind: "readme" | "file";
  project: string;
  ref?: string;
  path?: string;
  lineRange?: string;
}

/**
 * Splits an optional `<ref>@` prefix off the front of `spec`. Only an `@` at
 * `limit` or earlier counts, so callers can confine the search to the project
 * half of the spec — file paths legitimately contain `@`
 * (`packages/@scope/README.md`), and the first one there is not a ref
 * separator. A branch name containing `/-/` is not supported.
 */
function splitRef(spec: string, rawSpec: string, limit: number): [ref: string | undefined, rest: string] {
  const at = spec.indexOf("@");
  if (at === 0) throw new Error(`empty ref before "@" in "${rawSpec}"`);
  if (at < 0 || at > limit) return [undefined, spec];
  return [spec.slice(0, at), spec.slice(at + 1)];
}

export function parseInclude(kind: "readme" | "file", rawSpec: string): IncludeSpec {
  let spec = rawSpec.trim();

  let lineRange: string | undefined;
  if (kind === "file") {
    const m = /#L(\d+)(?:-(\d+))?$/.exec(spec);
    if (m) {
      lineRange = m[2] ? `${m[1]}-${m[2]}` : m[1];
      spec = spec.slice(0, m.index);
    }
  }

  if (kind === "readme") {
    const [ref, rest] = splitRef(spec, rawSpec, spec.length);
    if (rest.includes("/-/")) {
      throw new Error(`includeGitlabReadme takes a project only, not a file path: "${rawSpec}"`);
    }
    if (!rest) throw new Error(`includeGitlabReadme: missing project in "${rawSpec}"`);
    return { kind, project: rest, ...(ref ? { ref } : {}) };
  }

  if (!spec.includes("/-/")) {
    throw new Error(`includeGitlabFile requires a "/-/<path>": "${rawSpec}"`);
  }
  const [ref, rest] = splitRef(spec, rawSpec, spec.indexOf("/-/"));

  const sep = rest.indexOf("/-/");
  if (sep === -1) {
    throw new Error(`includeGitlabFile requires a "/-/<path>": "${rawSpec}"`);
  }
  const project = rest.slice(0, sep);
  const path = rest.slice(sep + 3);
  if (!project || !path) throw new Error(`includeGitlabFile: malformed spec "${rawSpec}"`);
  return { kind, project, path, ...(ref ? { ref } : {}), ...(lineRange ? { lineRange } : {}) };
}
