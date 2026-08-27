import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { describe, it, expect } from "vitest";
import { renderMarkdown, defaultMarkdownRenderChain, chainHasSanitize } from "./markdown";

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

describe("renderMarkdown foreign-content templates", () => {
  // Regression: a `<template>` inside SVG/MathML foreign content is an ordinary
  // element with no content fragment, but hast-util-from-parse5 recursed into
  // `reference.content` unconditionally and threw
  // `TypeError: Cannot read properties of undefined (reading 'nodeName')`.
  // With `strict: true` (the production default) that aborted the whole
  // Docusaurus build on any README containing such markup.
  // Guarded by patches/hast-util-from-parse5@8.0.3.patch — remove the patch and
  // this test starts failing again.
  it.each([
    "<svg><template>x</template></svg>",
    "<svg>\n<template>x</template>",
    "<math><template>x</template>",
    "<svg><animate onbegin=alert(1) attributeName=x dur=1s>\n<template><script>alert(1)</script></template>",
  ])("renders instead of crashing: %j", async (md) => {
    const html = await renderMarkdown(md, {});
    expect(typeof html).toBe("string");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onbegin");
    expect(html).not.toContain("<template");
  });
});

describe("chainHasSanitize", () => {
  it("is true when rehype-sanitize is present (bare, tuple, or default chain)", () => {
    expect(chainHasSanitize(defaultMarkdownRenderChain)).toBe(true);
    expect(chainHasSanitize([rehypeSanitize])).toBe(true);
    expect(chainHasSanitize([[rehypeSanitize, {}]])).toBe(true);
  });

  it("is false when rehype-sanitize is absent", () => {
    expect(chainHasSanitize([remarkParse])).toBe(false);
    expect(chainHasSanitize([])).toBe(false);
  });
});
