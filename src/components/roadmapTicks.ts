import type { ScaleTick } from "./types.js";

export type LayoutFit = "page" | "content";

/** A scale tick plus a flag marking year boundaries, which render a vertical rule. */
export interface RenderTick extends ScaleTick {
  major?: boolean;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;
/** Safety cap so a decades-long, year-only axis still can't overlap. */
const MAX_YEAR_TICKS = 20;

function parseDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function toISODate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Ticks for the page-fit gantt, chosen by the timeline span so labels never
 * overlap (they replace the fine weekly/monthly ticks, which would crowd a
 * fixed-width axis):
 *   - span > 6 years → one label per year (thinned further past ~20 years);
 *   - span > 3 years → a year label per year + an unlabelled mid-year mark;
 *   - span ≤ 3 years → quarter labels, each year boundary shown as the year.
 * Year boundaries are flagged `major` so the gantt draws a vertical rule there.
 */
export function pageTicks(rangeStart: string, rangeEnd: string): RenderTick[] {
  const startMs = parseDay(rangeStart);
  const endMs = parseDay(rangeEnd);
  const total = endMs - startMs;
  if (total <= 0) return [];

  const startYear = new Date(startMs).getUTCFullYear();
  const endYear = new Date(endMs).getUTCFullYear();
  const spanYears = total / MS_PER_YEAR;
  const ticks: RenderTick[] = [];
  const add = (ms: number, label: string, major: boolean): void => {
    if (ms >= startMs && ms < endMs) {
      ticks.push({ label, offsetPct: ((ms - startMs) / total) * 100, date: toISODate(ms), major });
    }
  };

  if (spanYears > 6) {
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y++) years.push(y);
    const step = Math.ceil(years.length / MAX_YEAR_TICKS);
    years.filter((_, i) => i % step === 0).forEach((y) => add(Date.UTC(y, 0, 1), String(y), true));
  } else if (spanYears > 3) {
    for (let y = startYear; y <= endYear; y++) {
      add(Date.UTC(y, 0, 1), String(y), true);
      add(Date.UTC(y, 6, 1), "", false); // mid-year marker
    }
  } else {
    for (let y = startYear; y <= endYear; y++) {
      for (let q = 0; q < 4; q++) {
        const major = q === 0;
        add(Date.UTC(y, q * 3, 1), major ? String(y) : `Q${q + 1}`, major);
      }
    }
  }
  return ticks;
}

/**
 * Choose which ticks the gantt renders. Content fit keeps the full (fine) tick
 * set and scrolls; page fit regenerates a span-appropriate, non-overlapping set.
 */
export function visibleTicks(
  ticks: ScaleTick[],
  fit: LayoutFit,
  rangeStart: string,
  rangeEnd: string,
): RenderTick[] {
  return fit === "content" ? ticks : pageTicks(rangeStart, rangeEnd);
}
