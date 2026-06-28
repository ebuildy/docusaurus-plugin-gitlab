import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

/**
 * This package is **ESM-only on purpose**.
 *
 * Every runtime dependency in the markdown pipeline (`unified`, `remark-*`,
 * `rehype-*`, `unist-util-*`) is pure ESM. A CJS build of this package therefore
 * emits `require("remark-gfm")` etc., and under Node >= 20.19 / >= 22 (where
 * `require(ESM)` is enabled) esbuild's interop returns the module *namespace*
 * (`{ default: fn }`) instead of the default export. Passing that to
 * `unified().use()` throws "Expected usable value but received an empty preset",
 * which broke the Docusaurus build in CI.
 *
 * Shipping ESM-only removes the broken artifact. These assertions guard against
 * accidentally reintroducing a CJS build / `require` export condition.
 */
describe("packaging: ESM-only", () => {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );

  const subpaths = [".", "./remark", "./components", "./plugin"];

  it("exposes the documented export subpaths", () => {
    for (const sub of subpaths) {
      expect(pkg.exports[sub], `missing export "${sub}"`).toBeTruthy();
    }
  });

  it("declares no CJS `require` condition on any export", () => {
    for (const sub of subpaths) {
      expect(pkg.exports[sub].require, `export "${sub}" must not have a require condition`).toBeUndefined();
    }
  });

  it("points every export target at an ESM `.js` file (never `.cjs`)", () => {
    const targets = subpaths.flatMap((sub) => Object.values(pkg.exports[sub] as Record<string, string>));
    for (const target of targets) {
      expect(target.endsWith(".cjs"), `export target ${target} must not be .cjs`).toBe(false);
    }
  });
});
