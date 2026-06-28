import { describe, it, expect } from "vitest";
import { injectProp } from "./inject";

describe("injectProp", () => {
  it("adds a data attribute with an estree expression value", () => {
    const node: any = { type: "mdxJsxFlowElement", name: "GitlabReleases", attributes: [] };
    injectProp(node, "data", [{ tagName: "v1" }]);
    const added = node.attributes[0];
    expect(added.type).toBe("mdxJsxAttribute");
    expect(added.name).toBe("data");
    expect(added.value.type).toBe("mdxJsxAttributeValueExpression");
    expect(added.value.data.estree.body[0].expression).toBeTruthy();
  });

  it("serializes the raw value into the expression string", () => {
    const node: any = { type: "mdxJsxFlowElement", name: "GitlabIssues", attributes: [] };
    injectProp(node, "error", { message: "boom", project: "g/r" });
    expect(node.attributes[0].value.value).toContain("boom");
  });
});
