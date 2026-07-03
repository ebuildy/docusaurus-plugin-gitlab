export interface ScopedLabel {
  scope: string;
  value: string;
}

/**
 * Parse a GitLab scoped label/topic name (e.g. "Abilities::Performance").
 *
 * GitLab treats everything before the *last* `::` as the scope and the
 * remainder as the value, so nested scopes like "priority::severity::high"
 * split into scope "priority::severity" / value "high". Returns `null` when
 * the name is not scoped or either side is empty.
 */
export function parseScopedLabel(name: string): ScopedLabel | null {
  const idx = name.lastIndexOf("::");
  if (idx === -1) return null;
  const scope = name.slice(0, idx).trim();
  const value = name.slice(idx + 2).trim();
  if (!scope || !value) return null;
  return { scope, value };
}
