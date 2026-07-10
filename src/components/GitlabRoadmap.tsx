import React from "react";
import { Fallback } from "./Fallback.js";
import { RoadmapGantt } from "./RoadmapGantt.js";
import { RoadmapTimeline } from "./RoadmapTimeline.js";
import type { ColorBy } from "./roadmapColor.js";
import type { ComponentPayload, RoadmapData } from "./types.js";

export interface GitlabRoadmapProps extends ComponentPayload<RoadmapData> {
  layout?: "gantt" | "timeline";
  colorBy?: ColorBy;
  showProgress?: boolean;
  showLabels?: boolean;
}

export function GitlabRoadmap({
  data,
  error,
  layout = "gantt",
  colorBy = "source",
  showProgress = true,
  showLabels = false,
}: GitlabRoadmapProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  const view = { data, colorBy, showProgress, showLabels };
  return layout === "timeline" ? <RoadmapTimeline {...view} /> : <RoadmapGantt {...view} />;
}
