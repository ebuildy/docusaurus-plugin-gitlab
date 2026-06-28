import { describe, it, expect } from "vitest";
import { parseAttributes } from "./attributes";

function attr(name: string, value: any) {
  return { type: "mdxJsxAttribute", name, value };
}
function expr(estree: any) {
  return { type: "mdxJsxAttributeValueExpression", value: "", data: { estree } };
}
function literalProgram(value: any) {
  return { body: [{ type: "ExpressionStatement", expression: { type: "Literal", value } }] };
}

describe("parseAttributes", () => {
  it("reads string-literal attributes", () => {
    expect(parseAttributes([attr("project", "g/r")], "f.mdx")).toEqual({ project: "g/r" });
  });

  it("reads numeric expression attributes", () => {
    expect(parseAttributes([attr("limit", expr(literalProgram(5)))], "f.mdx")).toEqual({ limit: 5 });
  });

  it("reads boolean expression attributes", () => {
    expect(parseAttributes([attr("includePrereleases", expr(literalProgram(true)))], "f.mdx")).toEqual({
      includePrereleases: true,
    });
  });

  it("treats a valueless attribute as boolean true", () => {
    expect(parseAttributes([attr("showStats", null)], "f.mdx")).toEqual({ showStats: true });
  });

  it("throws on a non-literal expression", () => {
    const program = { body: [{ type: "ExpressionStatement", expression: { type: "Identifier", name: "x" } }] };
    expect(() => parseAttributes([attr("limit", expr(program))], "f.mdx")).toThrow(/static/);
  });
});
