import React from "react";
import { resolveColor, type ColorBy } from "./roadmapColor.js";
import type { RoadmapData, RoadmapPositionedItem } from "./types.js";

export interface RoadmapViewProps {
  data: RoadmapData;
  colorBy: ColorBy;
  showProgress: boolean;
  showLabels: boolean;
}

function LabelChips({ item }: { item: RoadmapPositionedItem }) {
  return (
    <>
      {item.labels.map((l) => (
        <span key={l.name} className="gitlab-roadmap-label" style={{ backgroundColor: l.color, color: l.textColor }}>
          {l.name}
        </span>
      ))}
    </>
  );
}

export function RoadmapGantt({ data, colorBy, showProgress, showLabels }: RoadmapViewProps) {
  return (
    <div className="gitlab-roadmap gitlab-roadmap-gantt">
      <div className="gitlab-roadmap-scale">
        {data.ticks.map((t) => (
          <span key={t.label + t.offsetPct} className="gitlab-roadmap-tick" style={{ left: `${t.offsetPct}%` }}>
            {t.label}
          </span>
        ))}
      </div>
      {data.groups.map((group) => (
        <div key={group.key} className="gitlab-roadmap-group">
          {group.title && <div className="gitlab-roadmap-group-title">{group.title}</div>}
          {group.items.map((item) => {
            const color = resolveColor(item, colorBy);
            return (
              <div key={item.id} className="gitlab-roadmap-row">
                <div className="gitlab-roadmap-label-col">
                  <a href={item.webUrl}>{item.title}</a>
                  {showLabels && <LabelChips item={item} />}
                </div>
                <div className="gitlab-roadmap-track">
                  <div
                    className="gitlab-roadmap-bar"
                    style={{ left: `${item.offsetPct}%`, width: `${item.widthPct}%`, backgroundColor: color }}
                  >
                    {showProgress && item.progress != null && (
                      <div className="gitlab-roadmap-progress" style={{ width: `${item.progress}%` }} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
