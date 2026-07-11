import type { RoadmapPositionedItem } from "./types.js";

export interface QuarterGroup {
  key: string;
  /** "Q1".."Q4" */
  label: string;
  items: RoadmapPositionedItem[];
}
export interface YearGroup {
  year: string;
  quarters: QuarterGroup[];
}

/** The date an item is filed under: its start, falling back to its due date. */
function fileDate(item: RoadmapPositionedItem): string {
  return item.startDate ?? item.dueDate ?? "";
}

/**
 * Bucket positioned items into a year → quarter hierarchy, both levels sorted
 * chronologically. Empty quarters/years are omitted. Every item lands in exactly
 * one bucket (by its start date, or due date when it has no start).
 */
export function groupByYearQuarter(items: RoadmapPositionedItem[]): YearGroup[] {
  const byYear = new Map<string, Map<number, RoadmapPositionedItem[]>>();
  for (const item of items) {
    const iso = fileDate(item);
    if (!iso) continue;
    const year = iso.slice(0, 4);
    const quarter = Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;
    const quarters = byYear.get(year) ?? new Map<number, RoadmapPositionedItem[]>();
    const bucket = quarters.get(quarter) ?? [];
    bucket.push(item);
    quarters.set(quarter, bucket);
    byYear.set(year, quarters);
  }
  // Iterate entries so each year's quarter map is destructured directly — no
  // re-lookup, no non-null assertions, so an undefined map can never be reached.
  return [...byYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, quarters]) => ({
      year,
      quarters: [...quarters.entries()]
        .sort(([a], [b]) => a - b)
        .map(([q, items]) => ({ key: `${year}-Q${q}`, label: `Q${q}`, items })),
    }));
}
