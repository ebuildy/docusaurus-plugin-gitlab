import { describe, it, expect } from "vitest";
import docusaurusGitlabTheme from "./index.js";

const ctx = {} as any;

describe("docusaurusGitlabTheme", () => {
  it("has the package name", () => {
    const plugin = docusaurusGitlabTheme(ctx, {});
    expect(plugin.name).toBe("docusaurus-plugin-gitlab-theme");
  });

  it("injects a style tag with the card vars when enabled", () => {
    const plugin = docusaurusGitlabTheme(ctx, { theme: true });
    const tags = plugin.injectHtmlTags!({ content: undefined });
    const head = (tags.headTags ?? []) as any[];
    expect(head).toHaveLength(1);
    expect(head[0].tagName).toBe("style");
    expect(head[0].innerHTML).toContain("--gl-card-shadow");
    expect(head[0].innerHTML).toContain("[data-theme='dark']");
  });

  it("injects nothing when theme is false", () => {
    const plugin = docusaurusGitlabTheme(ctx, { theme: false });
    const tags = plugin.injectHtmlTags!({ content: undefined });
    expect(tags.headTags ?? []).toHaveLength(0);
  });

  it("throws on invalid options", () => {
    expect(() => docusaurusGitlabTheme(ctx, { theme: "x" } as any)).toThrow(
      /@ebuildy\/docusaurus-plugin-gitlab/,
    );
  });
});
