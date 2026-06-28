import { valueToEstree } from "estree-util-value-to-estree";

export function injectProp(node: any, name: "data" | "error", value: unknown): void {
  const expression = valueToEstree(value, { preserveReferences: false });
  const estree = {
    type: "Program",
    sourceType: "module",
    body: [{ type: "ExpressionStatement", expression }],
  };
  node.attributes.push({
    type: "mdxJsxAttribute",
    name,
    value: {
      type: "mdxJsxAttributeValueExpression",
      value: JSON.stringify(value),
      data: { estree },
    },
  });
}
