import React from "react";
import type { RoadmapViewProps } from "./RoadmapGantt.js";
import { resolveColor } from "./roadmapColor.js";

function dateRange(start: string | null, due: string | null): string {
  if (start && due) return `${start} → ${due}`;
  return start ?? due ?? "";
}

export function RoadmapTimeline({ data, colorBy, showProgress, showLabels }: RoadmapViewProps) {
  return (
    <div className="gitlab-roadmap gitlab-roadmap-timeline">
      {data.groups.map((group) => (
        <div key={group.key} className="gitlab-roadmap-group">
          {group.title && <div className="gitlab-roadmap-group-title">{group.title}</div>}
          <div className="gitlab-roadmap-spine">
            {group.items.map((item) => {
              const color = resolveColor(item, colorBy);
              return (
                <div key={item.id} className="gitlab-roadmap-node">
                  <span className="gitlab-roadmap-dot" style={{ backgroundColor: color }} />
                  <div className="gitlab-roadmap-card">
                    <a href={item.webUrl}>{item.title}</a>
                    <div className="gitlab-roadmap-dates">{dateRange(item.startDate, item.dueDate)}</div>
                    {showProgress && item.progress != null && (
                      <div className="gitlab-roadmap-meter-track">
                        <div className="gitlab-roadmap-meter" style={{ width: `${item.progress}%`, backgroundColor: color }} />
                      </div>
                    )}
                    {showLabels &&
                      item.labels.map((l) => (
                        <span key={l.name} className="gitlab-roadmap-label" style={{ backgroundColor: l.color, color: l.textColor }}>
                          {l.name}
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
