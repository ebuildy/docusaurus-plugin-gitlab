import { describe, it, expect } from "vitest";
import {
  selectScale,
  positionItem,
  buildTicks,
  groupItems,
  buildRoadmap,
} from "./roadmap";
import type { RoadmapItemData, RoadmapPositionedItem } from "./types";

function item(partial: Partial<RoadmapItemData>): RoadmapItemData {
  return {
    id: 1, iid: 1, title: "X", state: "opened",
    startDate: null, dueDate: null, webUrl: "https://x", labels: [],
    ...partial,
  };
}

describe("selectScale", () => {
  it("picks weeks for a short span (<= 92 days)", () => {
    expect(selectScale("2026-01-01", "2026-02-01")).toBe("weeks");
  });
  it("picks months for a mid span (<= 366 days)", () => {
    expect(selectScale("2026-01-01", "2026-07-01")).toBe("months");
  });
  it("picks quarters for a long span (> 366 days)", () => {
    expect(selectScale("2026-01-01", "2028-06-01")).toBe("quarters");
  });
});

describe("positionItem", () => {
  it("positions a bar as a percentage of the window", () => {
    const p = positionItem(
      item({ startDate: "2026-01-01", dueDate: "2026-01-06" }),
      "2026-01-01",
      "2026-01-11",
    );
    expect(p.offsetPct).toBe(0);
    expect(p.widthPct).toBe(50);
  });
  it("clamps a bar that starts before the window and keeps a minimum width", () => {
    const p = positionItem(
      item({ dueDate: "2026-01-02" }), // start falls back to due → zero-length
      "2026-01-01",
      "2026-01-11",
    );
    expect(p.offsetPct).toBeGreaterThanOrEqual(0);
    expect(p.widthPct).toBeGreaterThan(0);
    expect(p.offsetPct + p.widthPct).toBeLessThanOrEqual(100);
  });
});

describe("buildTicks", () => {
  it("emits one tick per month across the window", () => {
    const ticks = buildTicks("2026-01-01", "2026-04-01", "months");
    expect(ticks.map((t) => t.label)).toEqual(["Jan", "Feb", "Mar"]);
    expect(ticks[0].offsetPct).toBe(0);
  });
  it("tags each tick with its ISO boundary date", () => {
    const ticks = buildTicks("2026-01-01", "2026-04-01", "months");
    expect(ticks.map((t) => t.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("groupItems", () => {
  const positioned = (name: string, parent: string | null): RoadmapPositionedItem => ({
    ...item({ title: name, parentTitle: parent, labels: [] }),
    offsetPct: 0, widthPct: 10,
  });
  it("returns a single unnamed group when groupBy is none", () => {
    const groups = groupItems([positioned("a", null)], "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBeNull();
  });
  it("splits into one section per parent title when groupBy is parent", () => {
    const groups = groupItems(
      [positioned("a", "Platform"), positioned("b", "Growth"), positioned("c", null)],
      "parent",
    );
    expect(groups.map((g) => g.title).sort()).toEqual(["(no parent)", "Growth", "Platform"]);
  });
});

describe("buildRoadmap", () => {
  it("drops undated items, sorts, positions, and wraps in RoadmapData", () => {
    const data = buildRoadmap(
      [
        item({ id: 1, title: "late", startDate: "2026-06-01", dueDate: "2026-08-01" }),
        item({ id: 2, title: "early", startDate: "2026-01-01", dueDate: "2026-03-01" }),
        item({ id: 3, title: "undated" }),
      ],
      { source: "epics", order: "start", groupBy: "none" },
    );
    expect(data.source).toBe("epics");
    expect(data.groups[0].items.map((i) => i.title)).toEqual(["early", "late"]);
    expect(data.groups[0].items).toHaveLength(2); // undated dropped
    expect(data.rangeStart <= "2026-01-01").toBe(true);
    expect(data.ticks.length).toBeGreaterThan(0);
  });

  it("honors an explicit scale override and window", () => {
    const data = buildRoadmap(
      [item({ id: 1, title: "a", startDate: "2026-02-01", dueDate: "2026-03-01" })],
      { source: "epics", order: "start", groupBy: "none", scale: "weeks", from: "2026-01-01", to: "2026-04-01" },
    );
    expect(data.scale).toBe("weeks");
    expect(data.rangeStart).toBe("2026-01-01");
    expect(data.rangeEnd).toBe("2026-04-01");
  });

  it("returns an empty roadmap instead of throwing when no items have dates", () => {
    const data = buildRoadmap([item({ title: "undated" })], { source: "epics", order: "start", groupBy: "none" });
    expect(data.groups).toEqual([]);
    expect(data.ticks).toEqual([]);
  });

  it("does not throw on an empty item array", () => {
    expect(() => buildRoadmap([], { source: "milestones", order: "start", groupBy: "none" })).not.toThrow();
  });
});
