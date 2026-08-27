import { describe, expect, it } from "vitest";
import { resolveColor } from "../components/roadmapColor.js";
import { COMPONENT_REGISTRY } from "../remark/registry.js";
import { languageFromPath } from "./code.js";

// Object literals inherit from Object.prototype, so a lookup keyed by
// caller-supplied text returns an inherited member for `__proto__`,
// `constructor`, `toString`, … instead of undefined. Every `?? fallback`
// downstream is then skipped and a non-string/non-number escapes.
const INHERITED = ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty", "isPrototypeOf"];

describe("lookups keyed by untrusted text ignore inherited properties", () => {
  it.each(INHERITED)("languageFromPath(%j) returns a string", (key) => {
    expect(typeof languageFromPath(key)).toBe("string");
    expect(typeof languageFromPath(`dir/file.${key}`)).toBe("string");
  });

  it.each(INHERITED)("COMPONENT_REGISTRY has no fetcher named %j", (key) => {
    expect(COMPONENT_REGISTRY[key as keyof typeof COMPONENT_REGISTRY]).toBeUndefined();
  });

  it.each(INHERITED)("resolveColor tolerates a %j issue state", (key) => {
    const item = { state: key, labels: [], color: undefined } as never;
    expect(typeof resolveColor(item, "state")).toBe("string");
  });
});
