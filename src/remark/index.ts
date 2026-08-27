import { visit } from "unist-util-visit";
import { buildContext } from "../gitlab/context.js";
import { createHostMask, maskHostDeep } from "../gitlab/mask-host.js";
import { resolveOptions, type PluginOptions } from "../options.js";
import { parseAttributes } from "./attributes.js";
import { injectProp } from "./inject.js";
import { COMPONENT_REGISTRY } from "./registry.js";
import { mergeReadmeTocs } from "./toc-export.js";

export default function remarkGitlab(rawOptions: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const options = resolveOptions(rawOptions, mode);
  const ctx = buildContext(options);
  // Output masking, built once per plugin instance. Applied on the way OUT —
  // after the fetchers' cache — so changing the option takes effect on the next
  // build with no node_modules/.cache clear.
  const mask = createHostMask(options.host, options.gitlabPublicUrl);

  // `static/gitlab-assets` is a disposable, gitignored build artifact, but the
  // fetchers' cache hands back HTML that already points into it — so a cache hit
  // renders <img src="/gitlab-assets/…"> without ever calling localize(). Restore
  // the directory from the byte store once, before the first page is rendered,
  // rather than leaving it to a download that will not happen. Best-effort: a
  // site that localizes nothing must not fail to build over an unwritable dir.
  let materialized: Promise<void> | undefined;

  return async function transformer(tree: any, file: any) {
    materialized ??= ctx.assets.sync().catch(() => {});
    await materialized;

    const jobs: { node: any }[] = [];
    visit(tree, (node: any) => {
      if (
        (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
        node.name &&
        COMPONENT_REGISTRY[node.name]
      ) {
        jobs.push({ node });
      }
    });

    const sidebarReadmes: { node: any; entries: any[]; order: number }[] = [];

    await Promise.all(
      jobs.map(async ({ node }, order) => {
        const fetcher = COMPONENT_REGISTRY[node.name];
        const filePath = file?.path ?? "unknown.mdx";
        const attrs = parseAttributes(node.attributes ?? [], filePath);
        try {
          const data = maskHostDeep(await fetcher(ctx, attrs), mask);
          injectProp(node, "data", data);
          if (node.name === "GitlabReadme" && Array.isArray((data as any)?.toc)) {
            sidebarReadmes.push({ node, entries: (data as any).toc, order });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const where = node.position?.start
            ? `${filePath}:${node.position.start.line}:${node.position.start.column}`
            : filePath;
          if (options.strict) {
            throw new Error(`@ebuildy/docusaurus-plugin-gitlab: <${node.name}> failed at ${where} — ${message}`);
          }
          // gitbeaker error messages embed the request URL, and Fallback renders
          // `message` verbatim in non-strict mode — mask it like data, not incidentally.
          injectProp(node, "error", maskHostDeep({ message, project: String(attrs.project ?? "") }, mask));
        }
      }),
    );

    // Feed READMEs to the merge in document order, not fetch-completion order,
    // so the merged sidebar TOC is deterministic across builds.
    sidebarReadmes.sort((a, b) => a.order - b.order);
    mergeReadmeTocs(tree, sidebarReadmes);
  };
}
