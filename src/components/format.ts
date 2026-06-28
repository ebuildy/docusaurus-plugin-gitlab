/** Humanize a count GitHub-style: 6000 -> "6k", 6200 -> "6.2k", 1.5e6 -> "1.5M". */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const [value, suffix] = n < 1_000_000 ? [n / 1000, "k"] : [n / 1_000_000, "M"];
  return `${parseFloat(value.toFixed(1))}${suffix}`;
}
