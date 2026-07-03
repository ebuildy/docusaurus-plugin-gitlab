import { describe, it, expect } from "vitest";
import { parseScopedLabel } from "./scopedLabel";

describe("parseScopedLabel", () => {
  it("splits a scoped label on the double colon into scope and value", () => {
    expect(parseScopedLabel("Abilities::Performance")).toEqual({
      scope: "Abilities",
      value: "Performance",
    });
  });

  it("returns null for a plain (non-scoped) label", () => {
    expect(parseScopedLabel("bug")).toBeNull();
  });

  it("splits on the last double colon so the scope may itself be nested", () => {
    expect(parseScopedLabel("priority::severity::high")).toEqual({
      scope: "priority::severity",
      value: "high",
    });
  });

  it("keeps spaces inside the value but trims the boundaries", () => {
    expect(parseScopedLabel("workflow:: in dev ")).toEqual({
      scope: "workflow",
      value: "in dev",
    });
  });

  it("returns null when the scope or value is empty", () => {
    expect(parseScopedLabel("scope::")).toBeNull();
    expect(parseScopedLabel("::value")).toBeNull();
  });
});
