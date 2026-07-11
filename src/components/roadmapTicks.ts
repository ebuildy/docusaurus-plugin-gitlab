import type { ScaleTick } from "./types.js";

export type LayoutFit = "page" | "content";

/**
 * Roughly the number of short scale labels ("Feb", "Q1 26", "2026") that fit
 * across a default docs page column without the tick text overlapping. Used only
 * to decide when a page-fit gantt must coarsen its ticks.
 */
export const MAX_PAGE_TICKS = 16;

/**
 * Choose which scale ticks to render.
 *
 * - `content`: the gantt is allowed to grow and scroll, so every tick is shown.
 * - `page`: the gantt is pinned to the page width, so ticks are thinned until
 *   at most `MAX_PAGE_TICKS` labels remain (preventing overlap):
 *     1. if already ≤ max, keep them all;
 *     2. otherwise collapse to one tick per calendar year (relabelled "2026"),
 *        positioned at that year's first tick;
 *     3. if the years still exceed the max (decade-plus roadmaps), keep every
 *        ⌈years/max⌉-th year.
 *   When ticks carry no `date` (older callers), fall back to keeping every
 *   ⌈n/max⌉-th raw tick — still guaranteeing ≤ max labels.
 */
export function visibleTicks(ticks: ScaleTick[], fit: LayoutFit, max = MAX_PAGE_TICKS): ScaleTick[] {
  if (fit === "content" || ticks.length <= max) return ticks;

  const yearOf = (t: ScaleTick): string | undefined => t.date?.slice(0, 4);
  if (ticks.every((t) => yearOf(t) !== undefined)) {
    const years: ScaleTick[] = [];
    let seen: string | undefined;
    for (const t of ticks) {
      const y = yearOf(t)!;
      if (y !== seen) {
        years.push({ label: y, offsetPct: t.offsetPct, date: t.date });
        seen = y;
      }
    }
    if (years.length <= max) return years;
    const step = Math.ceil(years.length / max);
    return years.filter((_, i) => i % step === 0);
  }

  const step = Math.ceil(ticks.length / max);
  return ticks.filter((_, i) => i % step === 0);
}
