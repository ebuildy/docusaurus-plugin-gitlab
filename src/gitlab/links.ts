/** Where a relative link in fetched GitLab markdown should point. */
export type LinkMode = "gitlab" | "keep" | "site";

export interface RepoLinkContext {
  /** Where a relative link should point. */
  mode: LinkMode;
  /** Public GitLab base URL, e.g. "https://gitlab.com". Used by "gitlab" mode. */
  publicUrl: string;
  /** Project path with namespace, e.g. "group/project". */
  project: string;
  /** Branch, tag, or SHA the markdown was read at. */
  ref: string;
  /** Repo-relative path of the file being rendered, e.g. "docs/guide.md".
   *  Relative links resolve against its directory. Absent ⇒ repository root. */
  basePath?: string;
  /** Site path the mirrored docs tree is mounted at. Used by "site" mode. */
  linkBase?: string;
}

// A URI scheme: "https:", "mailto:", "tel:", "data:", …
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

// Markdown extensions stripped by "site" mode — Docusaurus routes carry none.
const MARKDOWN_EXT_RE = /\.mdx?$/i;

/** Splits "docs/x.md?plain=1#L4" into ["docs/x.md", "?plain=1#L4"]. */
function splitSuffix(href: string): [path: string, suffix: string] {
  const i = href.search(/[?#]/);
  return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i)];
}

/**
 * Normalizes a relative href to a clean repo-root-relative path. A leading "/"
 * means the repository root (matching how `AssetManager.absolute` treats image
 * paths); otherwise the path resolves against `basePath`'s directory. ".."
 * segments that would escape the root are clamped at it.
 */
function normalizePath(path: string, basePath: string | undefined): string {
  const segments = path.startsWith("/")
    ? []
    : (basePath ?? "").split("/").slice(0, -1).filter(Boolean);
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/**
 * Rewrites a relative link found in fetched GitLab markdown. Absolute URLs,
 * anchors, and non-http schemes are returned untouched, as is everything in
 * "keep" mode.
 */
export function resolveRepoLink(href: string, ctx: RepoLinkContext): string {
  if (ctx.mode === "keep") return href;
  if (!href.trim()) return href;
  if (href.startsWith("#")) return href;
  if (href.startsWith("//")) return href;
  if (SCHEME_RE.test(href)) return href;

  const [rawPath, suffix] = splitSuffix(href);
  // A query- or hash-only href ("?tab=x") targets the current document.
  if (!rawPath) return href;

  const path = normalizePath(rawPath, ctx.basePath);

  if (ctx.mode === "site") {
    const linkBase = (ctx.linkBase ?? "").replace(/\/+$/, "");
    if (path === "") return linkBase || "/";
    return `${linkBase}/${path.replace(MARKDOWN_EXT_RE, "")}${suffix}`;
  }

  const publicUrl = ctx.publicUrl.replace(/\/+$/, "");

  // A path that normalizes to "" (e.g. "..", ".", "/") has nowhere to point
  // under /-/blob/ — that route needs a file. Deliberate, narrow exception to
  // "always /-/blob/, never /-/tree/": GitLab redirects a blob URL pointing at
  // a directory to the tree view, which does not help when there is no path
  // at all, so we emit the repo tree URL for that ref directly. (Site mode
  // handles its own empty path above, before publicUrl is ever read.)
  if (path === "" && ctx.mode === "gitlab") {
    return `${publicUrl}/${ctx.project}/-/tree/${ctx.ref}`;
  }

  return `${publicUrl}/${ctx.project}/-/blob/${ctx.ref}/${path}${suffix}`;
}
