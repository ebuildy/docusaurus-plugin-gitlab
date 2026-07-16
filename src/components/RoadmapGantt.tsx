import React from "react";
import { resolveColor, type ColorBy } from "./roadmapColor.js";
import { visibleTicks, type LayoutFit } from "./roadmapTicks.js";
import type { RoadmapData, RoadmapPositionedItem } from "./types.js";

export interface RoadmapViewProps {
  data: RoadmapData;
  colorBy: ColorBy;
  showProgress: boolean;
  showLabels: boolean;
  /** Gantt only: pin to page width (thin ticks) or expand + scroll to fit content. */
  layoutFit?: LayoutFit;
}

/** Width (rem) each scale unit gets when the gantt expands to fit its content. */
const CONTENT_UNIT_REM = 3;
/** Width (rem) of the fixed left label column (matches the CSS grid/margin). */
const LABEL_COL_REM = 12.5;

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

export function RoadmapGantt({ data, colorBy, showProgress, showLabels, layoutFit = "page" }: RoadmapViewProps) {
  const ticks = visibleTicks(data.ticks, layoutFit, data.rangeStart, data.rangeEnd);
  // In content fit the gantt grows past the page and scrolls; size it to the full
  // (un-thinned) tick count so bars keep room. Page fit stays at 100% (no min-width).
  const minWidth =
    layoutFit === "content" ? `calc(${LABEL_COL_REM}rem + ${data.ticks.length * CONTENT_UNIT_REM}rem)` : undefined;
  return (
    // Outer box is the scroll container (constrained to the page width); the inner
    // box carries the content min-width so content fit scrolls internally instead of
    // overflowing the page.
    <div className={`gitlab-roadmap gitlab-roadmap-gantt gitlab-roadmap-fit-${layoutFit}`}>
      <div className="gitlab-roadmap-gantt-inner" style={{ minWidth }}>
        <div className="gitlab-roadmap-scale">
          {ticks.map((t) => (
            <span
              key={t.label + t.offsetPct}
              className={t.major ? "gitlab-roadmap-tick gitlab-roadmap-tick-major" : "gitlab-roadmap-tick"}
              style={{ left: `${t.offsetPct}%` }}
            >
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
    </div>
  );
}
