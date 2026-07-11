import { describe, it, expect } from "vitest";
import { visibleTicks } from "./roadmapTicks";
import type { ScaleTick } from "./types";

function monthlyTicks(months: number): ScaleTick[] {
  // months evenly spread; date walks forward one month at a time from 2026-01.
  return Array.from({ length: months }, (_, i) => {
    const y = 2026 + Math.floor(i / 12);
    const m = String((i % 12) + 1).padStart(2, "0");
    return { label: "M", offsetPct: (i / months) * 100, date: `${y}-${m}-01` };
  });
}

describe("visibleTicks", () => {
  it("content fit keeps every tick", () => {
    const ticks = monthlyTicks(48);
    expect(visibleTicks(ticks, "content")).toHaveLength(48);
  });

  it("page fit keeps all ticks when already within the limit", () => {
    const ticks = monthlyTicks(6);
    expect(visibleTicks(ticks, "page")).toHaveLength(6);
  });

  it("page fit collapses to one tick per year when too dense", () => {
    const ticks = monthlyTicks(48); // 4 years of months = 48 > 16
    const result = visibleTicks(ticks, "page");
    expect(result.map((t) => t.label)).toEqual(["2026", "2027", "2028", "2029"]);
    // year ticks sit at each year's first tick offset
    expect(result[0].offsetPct).toBe(0);
  });

  it("page fit thins years further for decade-plus roadmaps", () => {
    const ticks = monthlyTicks(12 * 40); // 40 years of months
    const result = visibleTicks(ticks, "page");
    expect(result.length).toBeLessThanOrEqual(16);
    expect(result.length).toBeGreaterThan(1);
  });

  it("page fit falls back to every-Nth tick when ticks lack dates", () => {
    const ticks: ScaleTick[] = Array.from({ length: 40 }, (_, i) => ({ label: `W${i}`, offsetPct: i * 2.5 }));
    const result = visibleTicks(ticks, "page");
    expect(result.length).toBeLessThanOrEqual(16);
    expect(result[0].label).toBe("W0");
  });
});
