/**
 * Builds a lookup table with **no prototype**, so a missing key misses.
 *
 * A plain object literal inherits from `Object.prototype`, so indexing it with
 * `__proto__`, `constructor`, `toString`, `valueOf`, … returns an inherited
 * member instead of `undefined`. Every `?? fallback` downstream is then skipped
 * and a function or object escapes where a string was expected — e.g.
 * `languageFromPath("x.__proto__")` returned `Object.prototype` and handed it to
 * the syntax highlighter as a language name.
 *
 * Use this for every table keyed by text this package does not control: file
 * paths and extensions, HTTP header values, tag names from parsed markup, and
 * JSX element names from an MDX document.
 */
export function lookupTable<V>(entries: Record<string, V>): Record<string, V> {
  return Object.assign(Object.create(null) as Record<string, V>, entries);
}
