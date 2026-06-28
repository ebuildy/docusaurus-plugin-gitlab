export interface MdxAttribute {
  type: string;
  name?: string;
  value?: unknown;
}

export function parseAttributes(attributes: MdxAttribute[], file: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const a of attributes) {
    if (a.type !== "mdxJsxAttribute" || !a.name) continue;
    out[a.name] = parseValue(a.value, a.name, file);
  }
  return out;
}

function parseValue(value: unknown, name: string, file: string): unknown {
  if (value === null || value === undefined) return true; // <C flag />
  if (typeof value === "string") return value;

  const v = value as { type?: string; data?: { estree?: any } };
  if (v.type === "mdxJsxAttributeValueExpression") {
    const stmt = v.data?.estree?.body?.[0];
    const expr = stmt?.expression;
    if (expr?.type === "Literal") return expr.value;
    throw new Error(
      `@ebuildy/docusaurus-plugin-gitlab: attribute "${name}" in ${file} must be a static literal ` +
        `(string, number, or boolean), got a dynamic expression.`,
    );
  }
  return value;
}
