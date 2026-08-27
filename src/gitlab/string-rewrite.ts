/**
 * Shared primitives for the two build-output rewrites — host masking
 * (`mask-host.ts`) and site-baseUrl prefixing (`base-url.ts`). Pure: no I/O,
 * no imports from the rest of the package.
 */

/** Escapes regex metacharacters. Introduces no letters, so a case expansion is safe to run after it. */
export function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(value: unknown, rewrite: (s: string) => string): unknown {
  if (typeof value === "string") return rewrite(value);
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = walk(item, rewrite);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (isPlainObject(value)) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const next = walk(item, rewrite);
      if (next !== item) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  }
  return value;
}

/**
 * Structural walk over strings, arrays, and plain objects. Anything else
 * (Date, Map, class instances) passes through by reference. Returns the input
 * unchanged — same reference — when nothing matched, so a no-op rewrite costs
 * no allocation.
 */
export function mapStringsDeep<T>(value: T, rewrite: (s: string) => string): T {
  return walk(value, rewrite) as T;
}
