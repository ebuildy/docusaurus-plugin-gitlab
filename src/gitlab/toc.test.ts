import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("rehypeGitlabToc", () => {
  it("replaces [[_TOC_]] with a nav listing h2/h3 headings", async () => {
    const md = "[[_TOC_]]\n\n## Install\n\n### Steps\n";
    const html = await renderMarkdown(md, {});

    expect(html).toContain('<nav class="gitlab-md-toc">');
    expect(html).toContain('<a href="#install">Install</a>');
    expect(html).toContain('<a href="#steps">Steps</a>');
    expect(html).toContain('<h2 id="install">');
    expect(html).toContain('<h3 id="steps">');
    expect(html).not.toContain("[[_TOC_]]");
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
  });
});
