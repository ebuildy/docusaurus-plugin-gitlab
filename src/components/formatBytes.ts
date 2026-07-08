/** Humanize a byte count: 1536 -> "1.5 KB", 4.4e6 -> "4.2 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${parseFloat(value.toFixed(1))} ${units[unit]}`;
}
