import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { resolveTheme, renderThemeCss, GL_CARD_VARS } from "./theme.js";

describe("resolveTheme", () => {
  it("defaults to enabled when no option is given", () => {
    expect(resolveTheme(undefined)).toEqual({ enabled: true });
    expect(resolveTheme({})).toEqual({ enabled: true });
  });

  it("respects theme: false", () => {
    expect(resolveTheme({ theme: false })).toEqual({ enabled: false });
  });

  it("throws on a non-boolean theme", () => {
    expect(() => resolveTheme({ theme: "yes" as any })).toThrow(
      /@ebuildy\/docusaurus-plugin-gitlab/,
    );
  });

  it("throws on unknown keys", () => {
    expect(() => resolveTheme({ accent: "#fff" } as any)).toThrow(
      /@ebuildy\/docusaurus-plugin-gitlab/,
    );
  });

  it("ignores the id key that Docusaurus injects", () => {
    expect(resolveTheme({ id: "default", theme: false } as any)).toEqual({ enabled: false });
    expect(resolveTheme({ id: "default" } as any)).toEqual({ enabled: true });
  });
});

describe("renderThemeCss", () => {
  const css = renderThemeCss();

  it("defines every --gl-card-* var on :root", () => {
    expect(css).toMatch(/:root\s*\{/);
    for (const v of GL_CARD_VARS) {
      expect(css, `missing ${v}`).toContain(`${v}:`);
    }
  });

  it("references --ifm-* theme variables for colors", () => {
    expect(css).toContain("var(--ifm-color-primary)");
    expect(css).toContain("var(--ifm-background-surface-color)");
  });

  it("includes a dark-mode override block", () => {
    expect(css).toContain("[data-theme='dark']");
  });

  it("uses no hardcoded hex palette colors", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("CSS module stays in sync with the theme vars", () => {
  it("references every --gl-card-* var", () => {
    const cssPath = fileURLToPath(
      new URL("../components/styles.module.css", import.meta.url),
    );
    const moduleCss = readFileSync(cssPath, "utf8");
    for (const v of GL_CARD_VARS) {
      expect(moduleCss, `styles.module.css does not use ${v}`).toContain(v);
    }
  });
});
