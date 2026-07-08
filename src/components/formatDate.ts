/**
 * Human, static-safe date: "May 1, 2020". Absolute (not "x ago") so a page
 * built once stays correct for years. Uses the build host's locale by default.
 */
export function formatDate(iso: string, locale?: string | string[]): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
