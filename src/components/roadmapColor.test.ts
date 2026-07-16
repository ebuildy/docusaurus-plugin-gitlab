import { describe, it, expect } from "vitest";
import { resolveColor } from "./roadmapColor";
import type { RoadmapPositionedItem } from "./types";

function item(partial: Partial<RoadmapPositionedItem>): RoadmapPositionedItem {
  return {
    id: 1, iid: 1, title: "X", state: "opened", startDate: null, dueDate: null,
    webUrl: "https://x", labels: [], offsetPct: 0, widthPct: 10, ...partial,
  };
}

describe("resolveColor", () => {
  it("source: uses the item's own color, falling back to the state color", () => {
    expect(resolveColor(item({ color: "#123456" }), "source")).toBe("#123456");
    expect(resolveColor(item({ color: undefined, state: "closed" }), "source")).toBe("#6b7280");
  });
  it("label: uses the first label's color, falling back to the state color", () => {
    expect(resolveColor(item({ labels: [{ name: "a", color: "#abcdef", textColor: "#fff" }] }), "label")).toBe("#abcdef");
    expect(resolveColor(item({ labels: [], state: "opened" }), "label")).toBe("#1f75cb");
  });
  it("state: uses the open/closed palette regardless of item color", () => {
    expect(resolveColor(item({ color: "#123456", state: "opened" }), "state")).toBe("#1f75cb");
    expect(resolveColor(item({ state: "closed" }), "state")).toBe("#6b7280");
  });
});
