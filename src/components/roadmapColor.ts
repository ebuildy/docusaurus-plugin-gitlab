import type { RoadmapPositionedItem } from "./types.js";

export type ColorBy = "source" | "label" | "state";

const STATE_COLORS: Record<string, string> = { opened: "#1f75cb", closed: "#6b7280" };

/** Resolve the bar/card tint for an item under the chosen colorBy strategy. */
export function resolveColor(item: RoadmapPositionedItem, colorBy: ColorBy): string {
  if (colorBy === "state") return STATE_COLORS[item.state] ?? STATE_COLORS.opened;
  if (colorBy === "label") return item.labels[0]?.color ?? STATE_COLORS[item.state];
  return item.color ?? STATE_COLORS[item.state]; // "source"
}
