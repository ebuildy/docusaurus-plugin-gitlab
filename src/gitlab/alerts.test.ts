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
});
