import React from "react";
import type { RoadmapViewProps } from "./RoadmapGantt.js";
import { resolveColor, type ColorBy } from "./roadmapColor.js";
import { groupByYearQuarter } from "./roadmapDateGroups.js";
import type { RoadmapPositionedItem } from "./types.js";

function dateRange(start: string | null, due: string | null): string {
  if (start && due) return `${start} → ${due}`;
  return start ?? due ?? "";
}

interface NodeOpts {
  colorBy: ColorBy;
  showProgress: boolean;
  showLabels: boolean;
}

function TimelineNode({ item, colorBy, showProgress, showLabels }: NodeOpts & { item: RoadmapPositionedItem }) {
  const color = resolveColor(item, colorBy);
  return (
    <div className="gitlab-roadmap-node">
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
}

function Spine({ items, ...node }: NodeOpts & { items: RoadmapPositionedItem[] }) {
  return (
    <div className="gitlab-roadmap-spine">
      {items.map((item) => (
        <TimelineNode key={item.id} item={item} {...node} />
      ))}
    </div>
  );
}

export function RoadmapTimeline({ data, colorBy, showProgress, showLabels }: RoadmapViewProps) {
  const node: NodeOpts = { colorBy, showProgress, showLabels };
  // No explicit groupBy → default to a year → quarter date hierarchy.
  const ungrouped = data.groups.length === 1 && data.groups[0].title === null;

  if (ungrouped) {
    return (
      <div className="gitlab-roadmap gitlab-roadmap-timeline">
        {groupByYearQuarter(data.groups[0].items).map((yearGroup) => (
          <div key={yearGroup.year} className="gitlab-roadmap-group">
            <div className="gitlab-roadmap-group-title">{yearGroup.year}</div>
            {yearGroup.quarters.map((q) => (
              <div key={q.key} className="gitlab-roadmap-subgroup">
                <div className="gitlab-roadmap-subgroup-title">{q.label}</div>
                <Spine items={q.items} {...node} />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // Explicit groupBy (label/parent): flat sections, as built at fetch time.
  return (
    <div className="gitlab-roadmap gitlab-roadmap-timeline">
      {data.groups.map((group) => (
        <div key={group.key} className="gitlab-roadmap-group">
          {group.title && <div className="gitlab-roadmap-group-title">{group.title}</div>}
          <Spine items={group.items} {...node} />
        </div>
      ))}
    </div>
  );
}
