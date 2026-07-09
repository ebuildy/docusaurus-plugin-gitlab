export const SECTION_NAMES = ["info", "readme", "releases", "issues"] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

export interface GeneratePagesSpec {
  group: string;
  sections: SectionName[];
  topics: string[];
  includeSubgroups: boolean;
  includeArchived: boolean;
  basePath: string;
}

/** Tokenize `key=value` pairs; value may be "double"/'single' quoted or bare. */
function parseAttrString(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) {
    out[m[1]] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseGeneratePages(attrString: string): GeneratePagesSpec {
  const raw = parseAttrString(attrString);
  if (!raw.group) {
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: {@generateGitlabPages} requires a "group".`,
    );
  }
  const sections = splitList(raw.sections);
  const resolvedSections = (sections.length ? sections : ["readme"]) as string[];
  for (const s of resolvedSections) {
    if (!SECTION_NAMES.includes(s as SectionName)) {
      throw new Error(
        `@ebuildy/docusaurus-plugin-gitlab: {@generateGitlabPages} unknown section "${s}"; ` +
          `valid: ${SECTION_NAMES.join(", ")}.`,
      );
    }
  }
  return {
    group: raw.group,
    sections: resolvedSections as SectionName[],
    topics: splitList(raw.topics),
    includeSubgroups: raw.includeSubgroups === "true",
    includeArchived: raw.includeArchived === "true",
    basePath: raw.basePath || "projects",
  };
}
