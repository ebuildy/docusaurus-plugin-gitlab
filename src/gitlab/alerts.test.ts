import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

describe("rehypeGitlabAlerts", () => {
  it("renders a [!note] blockquote as an Infima alert div", async () => {
    const md = "> [!note]\n> The following information is useful.\n";
    const html = await renderMarkdown(md, {});

    expect(html).toContain(
      'class="gitlab-md-alert gitlab-md-alert--note alert alert--secondary"',
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('<p class="gitlab-md-alert-title">Note</p>');
    expect(html).toContain("<p>The following information is useful.</p>");
    expect(html).not.toContain("[!note]");
    expect(html).not.toContain("<blockquote>");
  });

  it("reduces an inline-formatted custom title to plain text without leaking markup", async () => {
    const md = "> [!note] **Bold Title**\n> Body text.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain('<p class="gitlab-md-alert-title">Bold Title</p>');
    expect(html).toContain("<p>Body text.</p>");
    expect(html).not.toContain("<strong>");
  });

  it("does not leave a stray <br> when the marker line has trailing whitespace", async () => {
    const md = "> [!note]   \n> Body text.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain('<p class="gitlab-md-alert-title">Note</p>');
    expect(html).toContain("<p>Body text.</p>");
    expect(html).not.toContain("<br>");
  });

  it.each([
    ["note", "alert--secondary", "Note"],
    ["tip", "alert--success", "Tip"],
    ["important", "alert--info", "Important"],
    ["caution", "alert--warning", "Caution"],
    ["warning", "alert--danger", "Warning"],
  ])("maps [!%s] to %s with default title %s", async (type, infima, title) => {
    const html = await renderMarkdown(`> [!${type}]\n> Body text.\n`, {});
    expect(html).toContain(
      `class="gitlab-md-alert gitlab-md-alert--${type} alert ${infima}"`,
    );
    expect(html).toContain(`<p class="gitlab-md-alert-title">${title}</p>`);
    expect(html).toContain("<p>Body text.</p>");
  });

  it("uses a same-line custom title when present", async () => {
    const md = "> [!warning] Data deletion\n> This is destructive.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain('class="gitlab-md-alert gitlab-md-alert--warning alert alert--danger"');
    expect(html).toContain('<p class="gitlab-md-alert-title">Data deletion</p>');
    expect(html).toContain("<p>This is destructive.</p>");
  });

  it("falls back to the default title when the custom title is blank", async () => {
    const html = await renderMarkdown("> [!tip]   \n> Tip body.\n", {});
    expect(html).toContain('<p class="gitlab-md-alert-title">Tip</p>');
    expect(html).toContain("<p>Tip body.</p>");
  });

  it.each(["[!NOTE]", "[!Note]", "[!nOtE]"])(
    "matches %s case-insensitively and normalizes to note",
    async (marker) => {
      const html = await renderMarkdown(`> ${marker}\n> Body.\n`, {});
      expect(html).toContain(
        'class="gitlab-md-alert gitlab-md-alert--note alert alert--secondary"',
      );
      expect(html).toContain('<p class="gitlab-md-alert-title">Note</p>');
    },
  );

  it("leaves an unknown alert type as a plain blockquote", async () => {
    const html = await renderMarkdown("> [!foo]\n> Body.\n", {});
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("gitlab-md-alert");
  });

  it("leaves an ordinary blockquote untouched", async () => {
    const html = await renderMarkdown("> Just a quote.\n", {});
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("gitlab-md-alert");
  });

  it("does not transform when the marker is not at the line start", async () => {
    const html = await renderMarkdown("> see [!note] here\n", {});
    expect(html).toContain("<blockquote>");
    expect(html).not.toContain("gitlab-md-alert");
  });

  it("renders a marker-only alert with no stray empty paragraph", async () => {
    const html = await renderMarkdown("> [!important]\n", {});
    expect(html).toContain('class="gitlab-md-alert gitlab-md-alert--important alert alert--info"');
    expect(html).toContain('<p class="gitlab-md-alert-title">Important</p>');
    expect(html).not.toMatch(/<p><\/p>/);
  });

  it("preserves inline markdown inside the alert body", async () => {
    const md = "> [!note]\n> Read **this** and [docs](https://x.test).\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain("<strong>this</strong>");
    expect(html).toContain('href="https://x.test"');
  });

  it("transforms multiple alerts in one document independently", async () => {
    const md = "> [!tip]\n> First.\n\n> [!warning]\n> Second.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain("gitlab-md-alert--tip");
    expect(html).toContain("gitlab-md-alert--warning");
    expect(html).toContain("<p>First.</p>");
    expect(html).toContain("<p>Second.</p>");
  });

  it("escapes HTML in a custom title and runs no handlers", async () => {
    const md = '> [!warning] <img src=x onerror="alert(1)">\n> Body.\n';
    const html = await renderMarkdown(md, {});
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("gitlab-md-alert-title");
  });

  it("applies both the TOC and alert transforms in one document", async () => {
    const md = "[[_TOC_]]\n\n## Heading\n\n> [!note]\n> Note body.\n";
    const html = await renderMarkdown(md, {});
    expect(html).toContain('<nav class="gitlab-md-toc">');
    expect(html).toContain("gitlab-md-alert--note");
  });
});
