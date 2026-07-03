export interface IncludeSpec {
  kind: "readme" | "file";
  project: string;
  ref?: string;
  path?: string;
  lineRange?: string;
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

  let ref: string | undefined;
  const at = spec.indexOf("@");
  if (at > 0) {
    ref = spec.slice(0, at);
    spec = spec.slice(at + 1);
  } else if (at === 0) {
    throw new Error(`empty ref before "@" in "${rawSpec}"`);
  }

  if (kind === "readme") {
    if (spec.includes("/-/")) {
      throw new Error(`includeGitlabReadme takes a project only, not a file path: "${rawSpec}"`);
    }
    if (!spec) throw new Error(`includeGitlabReadme: missing project in "${rawSpec}"`);
    return { kind, project: spec, ...(ref ? { ref } : {}) };
  }

  const sep = spec.indexOf("/-/");
  if (sep === -1) {
    throw new Error(`includeGitlabFile requires a "/-/<path>": "${rawSpec}"`);
  }
  const project = spec.slice(0, sep);
  const path = spec.slice(sep + 3);
  if (!project || !path) throw new Error(`includeGitlabFile: malformed spec "${rawSpec}"`);
  return { kind, project, path, ...(ref ? { ref } : {}), ...(lineRange ? { lineRange } : {}) };
}
