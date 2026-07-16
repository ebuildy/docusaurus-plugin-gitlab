import React from "react";
import { Fallback } from "./Fallback.js";
import { RoadmapGantt } from "./RoadmapGantt.js";
import { RoadmapTimeline } from "./RoadmapTimeline.js";
import type { ColorBy } from "./roadmapColor.js";
import type { LayoutFit } from "./roadmapTicks.js";
import type { ComponentPayload, RoadmapData } from "./types.js";

export interface GitlabRoadmapProps extends ComponentPayload<RoadmapData> {
  layout?: "gantt" | "timeline";
  colorBy?: ColorBy;
  showProgress?: boolean;
  showLabels?: boolean;
  /** Gantt only: "page" pins to the page width (thinning ticks), "content" expands + scrolls. */
  layoutFit?: LayoutFit;
}

export function GitlabRoadmap({
  data,
  error,
  layout = "gantt",
  colorBy = "source",
  showProgress = true,
  showLabels = false,
  layoutFit = "page",
}: GitlabRoadmapProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  // Normalize any arbitrary MDX attribute string to a known value before it
  // becomes a `gitlab-roadmap-fit-${fit}` class name.
  const fit: LayoutFit = layoutFit === "content" ? "content" : "page";
  const view = { data, colorBy, showProgress, showLabels, layoutFit: fit };
  return layout === "timeline" ? <RoadmapTimeline {...view} /> : <RoadmapGantt {...view} />;
}
