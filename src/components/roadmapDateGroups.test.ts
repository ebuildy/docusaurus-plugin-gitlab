import { describe, it, expect } from "vitest";
import { groupByYearQuarter } from "./roadmapDateGroups";
import type { RoadmapPositionedItem } from "./types";

function pos(id: number, title: string, startDate: string | null, dueDate: string | null = null): RoadmapPositionedItem {
  return {
    id, iid: id, title, state: "opened", startDate, dueDate, webUrl: `https://x/${id}`,
    labels: [], offsetPct: 0, widthPct: 10,
  };
}

describe("groupByYearQuarter", () => {
  it("buckets items into year → quarter, both sorted chronologically", () => {
    const groups = groupByYearQuarter([
      pos(1, "late", "2027-02-01"),
      pos(2, "mid", "2026-05-01"),
      pos(3, "early", "2026-01-15"),
    ]);
    expect(groups.map((g) => g.year)).toEqual(["2026", "2027"]);
    expect(groups[0].quarters.map((q) => q.label)).toEqual(["Q1", "Q2"]);
    expect(groups[0].quarters[0].items.map((i) => i.title)).toEqual(["early"]);
    expect(groups[0].quarters[1].items.map((i) => i.title)).toEqual(["mid"]);
    expect(groups[1].quarters.map((q) => q.label)).toEqual(["Q1"]);
  });

  it("files an item with no start date under its due date", () => {
    const groups = groupByYearQuarter([pos(1, "dueOnly", null, "2026-11-01")]);
    expect(groups[0].year).toBe("2026");
    expect(groups[0].quarters[0].label).toBe("Q4");
  });

  it("puts several items in the same quarter bucket", () => {
    const groups = groupByYearQuarter([
      pos(1, "a", "2026-07-01"),
      pos(2, "b", "2026-08-15"),
    ]);
    expect(groups[0].quarters).toHaveLength(1);
    expect(groups[0].quarters[0].label).toBe("Q3");
    expect(groups[0].quarters[0].items.map((i) => i.title)).toEqual(["a", "b"]);
  });
});
