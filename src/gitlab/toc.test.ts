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

  it("does not add heading ids when no [[_TOC_]] marker is present", async () => {
    const html = await renderMarkdown("## Install\n\n### Steps\n", {});
    expect(html).toContain("<h2>Install</h2>");
    expect(html).toContain("<h3>Steps</h3>");
    expect(html).not.toContain("id=");
    expect(html).not.toContain("gitlab-md-toc");
  });

  it("nests h2-h5 headings by depth", async () => {
    const md = "[[_TOC_]]\n\n## A\n\n### B\n\n#### C\n\n##### D\n\n## E\n";
    const html = await renderMarkdown(md, {});

    // All four nested levels are linked.
    expect(html).toContain('<a href="#a">A</a>');
    expect(html).toContain('<a href="#b">B</a>');
    expect(html).toContain('<a href="#c">C</a>');
    expect(html).toContain('<a href="#d">D</a>');
    expect(html).toContain('<a href="#e">E</a>');

    // A's entry opens a nested list before E (a sibling) appears.
    const navStart = html.indexOf('<nav class="gitlab-md-toc">');
    const nav = html.slice(navStart, html.indexOf("</nav>", navStart));
    expect(nav.indexOf("#b")).toBeGreaterThan(nav.indexOf("#a"));
    expect(nav.indexOf("#e")).toBeGreaterThan(nav.indexOf("#d"));
    // B's list is nested inside A's <li>.
    expect(nav).toMatch(/#a">A<\/a><ul>/);
  });

  it("dedupes slugs for duplicate heading text", async () => {
    const md = "[[_TOC_]]\n\n## Setup\n\n## Setup\n";
    const html = await renderMarkdown(md, {});

    expect(html).toContain('<h2 id="setup">');
    expect(html).toContain('<h2 id="setup-1">');
    expect(html).toContain('<a href="#setup">Setup</a>');
    expect(html).toContain('<a href="#setup-1">Setup</a>');
  });

  it("removes the marker entirely when there are no h2-h5 headings", async () => {
    const html = await renderMarkdown("[[_TOC_]]\n\njust a paragraph\n", {});
    expect(html).toContain("<p>just a paragraph</p>");
    expect(html).not.toContain("gitlab-md-toc");
    expect(html).not.toContain("[[_TOC_]]");
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
  });

  it("leaves an inline [[_TOC_]] inside a sentence untouched", async () => {
    const html = await renderMarkdown("see the [[_TOC_]] below\n\n## Install\n", {});
    expect(html).not.toContain("gitlab-md-toc");
    // Inline marker was not pre-processed; it renders as ordinary markdown.
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
    expect(html).toContain("<h2>Install</h2>"); // no marker line => no id slugging
  });

  it("escapes heading text and drops handlers in the generated TOC", async () => {
    const md = '[[_TOC_]]\n\n## <img src="x" onerror="alert(1)">Danger\n';
    const html = await renderMarkdown(md, {});

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
    // TOC link text is the heading's plain text, anchored to its slug.
    expect(html).toContain('<a href="#danger">Danger</a>');
  });

  it("sidebar mode: assigns ids, emits no inline nav, strips the marker", async () => {
    const md = "[[_TOC_]]\n\n## Install\n\n### Steps\n";
    const html = await renderMarkdown(md, { tocMode: "sidebar" });
    expect(html).toContain('<h2 id="install">');
    expect(html).toContain('<h3 id="steps">');
    expect(html).not.toContain("gitlab-md-toc");
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
  });

  it("sidebar mode: assigns ids even without a marker", async () => {
    const html = await renderMarkdown("## Install\n\n### Steps\n", { tocMode: "sidebar" });
    expect(html).toContain('<h2 id="install">');
    expect(html).toContain('<h3 id="steps">');
    expect(html).not.toContain("gitlab-md-toc");
  });

  it("sidebar mode: collects heading entries into the provided array", async () => {
    const collectToc: { level: number; id: string; text: string }[] = [];
    await renderMarkdown("## Install\n\n### Steps\n", { tocMode: "sidebar", collectToc });
    expect(collectToc).toEqual([
      { level: 2, id: "install", text: "Install" },
      { level: 3, id: "steps", text: "Steps" },
    ]);
  });

  it("hidden mode: assigns ids but renders no nav and strips the marker", async () => {
    const html = await renderMarkdown("[[_TOC_]]\n\n## Install\n", { tocMode: "hidden" });
    expect(html).toContain('<h2 id="install">');
    expect(html).not.toContain("gitlab-md-toc");
    expect(html).not.toContain("GITLAB_MD_TOC_PLACEHOLDER");
  });

  it("inline mode: renders the nav above the first heading when no marker is present", async () => {
    const html = await renderMarkdown("intro text\n\n## Install\n\n### Steps\n", { tocMode: "inline" });
    expect(html).toContain('<nav class="gitlab-md-toc">');
    expect(html).toContain('<a href="#install">Install</a>');
    expect(html).toContain('<h2 id="install">');
    expect(html.indexOf("gitlab-md-toc")).toBeLessThan(html.indexOf('<h2 id="install">'));
  });

  it("inline mode: replaces the marker in place when present", async () => {
    const html = await renderMarkdown("## A\n\n[[_TOC_]]\n\n## B\n", { tocMode: "inline" });
    expect(html).toContain('<nav class="gitlab-md-toc">');
    expect(html.indexOf("gitlab-md-toc")).toBeGreaterThan(html.indexOf('<h2 id="a">'));
    expect(html.indexOf("gitlab-md-toc")).toBeLessThan(html.indexOf('<h2 id="b">'));
  });
});
