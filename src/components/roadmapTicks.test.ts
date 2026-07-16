import { describe, it, expect } from "vitest";
import { visibleTicks, pageTicks } from "./roadmapTicks";
import type { ScaleTick } from "./types";

describe("visibleTicks", () => {
  it("content fit returns the given ticks unchanged", () => {
    const ticks: ScaleTick[] = [{ label: "Jan", offsetPct: 0 }, { label: "Feb", offsetPct: 50 }];
    expect(visibleTicks(ticks, "content", "2026-01-01", "2026-03-01")).toBe(ticks);
  });

  it("page fit regenerates span-based ticks, ignoring the fine input ticks", () => {
    const fine: ScaleTick[] = [{ label: "Jan", offsetPct: 0 }];
    const out = visibleTicks(fine, "page", "2026-01-01", "2028-01-01");
    expect(out).not.toContain(fine[0]);
    expect(out.some((t) => t.label === "2026")).toBe(true);
  });
});

describe("pageTicks", () => {
  it("span > 6 years: only year labels, all major", () => {
    const t = pageTicks("2026-01-01", "2033-06-01"); // ~7.4y
    expect(t.every((x) => x.major)).toBe(true);
    expect(t.map((x) => x.label)).toEqual(["2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033"]);
  });

  it("span > 3 and <= 6 years: year majors plus unlabelled mid-year minors", () => {
    const t = pageTicks("2026-01-01", "2030-06-01"); // ~4.4y
    expect(t.filter((x) => x.major).map((x) => x.label)).toEqual(["2026", "2027", "2028", "2029", "2030"]);
    const minors = t.filter((x) => !x.major);
    expect(minors).toHaveLength(4); // mid-2026..mid-2029 (mid-2030 is past the end)
    expect(minors.every((x) => x.label === "")).toBe(true);
  });

  it("span <= 3 years: quarter labels with each year boundary shown as the year (major)", () => {
    const t = pageTicks("2026-01-01", "2028-01-01"); // 2y
    expect(t.filter((x) => x.major).map((x) => x.label)).toEqual(["2026", "2027"]);
    expect(t.map((x) => x.label)).toEqual(["2026", "Q2", "Q3", "Q4", "2027", "Q2", "Q3", "Q4"]);
  });

  it("caps a decades-long span so year labels can't overflow", () => {
    const t = pageTicks("2000-01-01", "2050-01-01"); // 50y
    expect(t.length).toBeLessThanOrEqual(20);
    expect(t.every((x) => x.major)).toBe(true);
  });

  it("returns nothing for a non-positive window", () => {
    expect(pageTicks("2026-01-01", "2026-01-01")).toEqual([]);
  });
});
