import { describe, it, expect } from "vitest";
import { parseGeneratePages, SECTION_NAMES } from "./directive.js";

describe("parseGeneratePages", () => {
  it("parses all attributes with quoted and bare values", () => {
    const spec = parseGeneratePages(
      `group=1 sections="info,readme,releases" topics="public-docs" includeSubgroups=true includeArchived=false`,
    );
    expect(spec).toEqual({
      group: "1",
      sections: ["info", "readme", "releases"],
      topics: ["public-docs"],
      includeSubgroups: true,
      includeArchived: false,
    });
  });

  it("applies defaults: sections=[readme], no topics, flags false", () => {
    expect(parseGeneratePages(`group=42`)).toEqual({
      group: "42",
      sections: ["readme"],
      topics: [],
      includeSubgroups: false,
      includeArchived: false,
    });
  });

  it("throws when group is missing", () => {
    expect(() => parseGeneratePages(`sections="readme"`)).toThrow(/requires a "group"/);
  });

  it("throws on an unknown section", () => {
    expect(() => parseGeneratePages(`group=1 sections="readme,bogus"`)).toThrow(/bogus/);
  });

  it("exposes the valid section names", () => {
    expect(SECTION_NAMES).toEqual(["info", "readme", "releases", "issues"]);
  });
});
