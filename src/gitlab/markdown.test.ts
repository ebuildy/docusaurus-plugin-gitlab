import rehypeRaw from "rehype-raw";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { describe, it, expect } from "vitest";
import { renderMarkdown, defaultMarkdownRenderChain } from "./markdown";

describe("renderMarkdown", () => {
  it("renders gfm markdown to html", async () => {
    const html = await renderMarkdown("# Hello\n\n- a\n- b", {});
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("<li>a</li>");
  });

  it("converts :emoji: shortcodes to unicode emoji", async () => {
    const html = await renderMarkdown("Ship it :rocket:", {});
    expect(html).toContain("🚀");
    expect(html).not.toContain(":rocket:");
  });

  it("strips dangerous html", async () => {
    const html = await renderMarkdown("<script>alert(1)</script>ok", {});
    expect(html).not.toContain("<script>");
    expect(html).toContain("ok");
  });

  // Security regression: raw HTML must be sanitized (rehype-raw before rehype-sanitize).
  // Guards against a future plugin reorder silently opening an XSS hole, since
  // README content is untrusted.
  it("strips event-handler attributes and javascript: hrefs from raw html", async () => {
    const html = await renderMarkdown(
      '<img src="x.png" onerror="alert(1)"> <a href="javascript:alert(1)">click</a>',
      {},
    );
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("click");
  });

  it("rewrites image src via the transform hook", async () => {
    const html = await renderMarkdown("![x](./img/a.png)", {
      transformImageSrc: async (src) => `/local/${src.replace(/[^a-z]/gi, "")}`,
    });
    expect(html).toContain('src="/local/imgapng"');
  });

  it("leaves links unchanged when no link transform is given", async () => {
    const html = await renderMarkdown("[a](./b.md)", {});
    expect(html).toContain('href="./b.md"');
  });

  it("rewrites link href via the transform hook", async () => {
    const html = await renderMarkdown("[a](./b.md)", {
      transformLinkHref: async (href) => `https://x/${href}`,
    });
    expect(html).toContain('href="https://x/./b.md"');
  });

  it("uses a custom renderChain verbatim (omitting sanitize lets raw html through)", async () => {
    const html = await renderMarkdown('<b onclick="x()">hi</b>', {
      renderChain: [remarkParse, [remarkRehype, { allowDangerousHtml: true }], rehypeRaw],
    });
    expect(html).toContain("onclick");
    expect(html).toContain("hi");
  });

  it("exports the default chain used when no renderChain is given", async () => {
    expect(defaultMarkdownRenderChain.length).toBe(6);
    const html = await renderMarkdown('<b onclick="x()">hi</b>', {});
    expect(html).not.toContain("onclick");
  });
});
