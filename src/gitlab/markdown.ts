import type { Root, Element } from "hast";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGemoji from "remark-gemoji";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { rehypeGitlabAlerts } from "./alerts.js";
import { rehypeGitlabToc, TOC_PLACEHOLDER, type TocMode, type TocEntry } from "./toc.js";

export interface RenderOptions {
  transformImageSrc?: (src: string) => Promise<string>;
  transformLinkHref?: (href: string) => Promise<string>;
  tocMode?: TocMode;
  collectToc?: TocEntry[];
}

// Matches a standalone `[[_TOC_]]` line (allowing leading/trailing spaces/tabs).
const TOC_MARKER_RE = /^[^\S\r\n]*\[\[_TOC_\]\][^\S\r\n]*$/gim;

export async function renderMarkdown(md: string, opts: RenderOptions): Promise<string> {
  const source = md.replace(TOC_MARKER_RE, TOC_PLACEHOLDER);

  const transforms: { el: Element; attr: "src" | "href"; fn: (v: string) => Promise<string> }[] = [];

  const collect = () => (tree: Root) => {
    visit(tree, "element", (el: Element) => {
      if (el.tagName === "img" && opts.transformImageSrc && typeof el.properties?.src === "string") {
        transforms.push({ el, attr: "src", fn: opts.transformImageSrc });
      }
      if (el.tagName === "a" && opts.transformLinkHref && typeof el.properties?.href === "string") {
        transforms.push({ el, attr: "href", fn: opts.transformLinkHref });
      }
    });
  };

  const processor = unified()
    .use(remarkParse)
    .use(remarkGemoji)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
    .use(rehypeGitlabToc, { mode: opts.tocMode ?? "auto", collect: opts.collectToc })
    .use(rehypeGitlabAlerts)
    .use(collect)
    .use(rehypeStringify);

  const tree = processor.parse(source);
  const hast = (await processor.run(tree)) as unknown as Root;

  await Promise.all(
    transforms.map(async (t) => {
      const current = t.el.properties![t.attr] as string;
      t.el.properties![t.attr] = await t.fn(current);
    }),
  );

  return processor.stringify(hast as never);
}
