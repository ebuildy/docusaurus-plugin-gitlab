import { visit } from "unist-util-visit";
import { buildContext } from "../gitlab/context.js";
import { resolveOptions, type PluginOptions } from "../options.js";
import { parseAttributes } from "./attributes.js";
import { injectProp } from "./inject.js";
import { COMPONENT_REGISTRY } from "./registry.js";
import { mergeReadmeTocs } from "./toc-export.js";

export default function remarkGitlab(rawOptions: PluginOptions) {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const options = resolveOptions(rawOptions, mode);
  const ctx = buildContext(options);

  return async function transformer(tree: any, file: any) {
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
          const data = await fetcher(ctx, attrs);
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
          injectProp(node, "error", { message, project: String(attrs.project ?? "") });
        }
      }),
    );

    // Feed READMEs to the merge in document order, not fetch-completion order,
    // so the merged sidebar TOC is deterministic across builds.
    sidebarReadmes.sort((a, b) => a.order - b.order);
    mergeReadmeTocs(tree, sidebarReadmes);
  };
}
