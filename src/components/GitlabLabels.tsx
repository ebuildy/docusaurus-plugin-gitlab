import React from "react";
import { Fallback } from "./Fallback.js";
import { cardsGridStyle, type ComponentLayout } from "./layout.js";
import { parseScopedLabel } from "./scopedLabel.js";
import type { ComponentPayload, LabelData } from "./types.js";

interface GitlabLabelsProps extends ComponentPayload<LabelData[]>, ComponentLayout {
  layout?: "list" | "cards";
}

/**
 * Render the inner content of a label badge. GitLab scoped labels
 * ("scope::value") render as two segments: the scope keeps the label color,
 * the value gets a dark-gray treatment (see `.gitlab-label-value` in theme.css).
 */
function LabelContent({ label }: { label: LabelData }) {
  const scoped = parseScopedLabel(label.name);
  if (!scoped) return <>{label.name}</>;
  return (
    <>
      <span
        className="gitlab-label-scope"
        style={{ backgroundColor: label.color, color: label.textColor }}
      >
        {scoped.scope}
      </span>
      <span className="gitlab-label-value">{scoped.value}</span>
    </>
  );
}

function badgeStyle(label: LabelData): React.CSSProperties {
  // A scoped label colors its segments individually and is framed with a border
  // in the scope color; a plain label carries the color on the badge as before.
  if (parseScopedLabel(label.name)) return { borderColor: label.color };
  return { backgroundColor: label.color, color: label.textColor };
}

function badgeClassName(label: LabelData): string {
  const base = "gitlab-badge gitlab-label";
  return parseScopedLabel(label.name) ? `${base} gitlab-label--scoped` : base;
}

export function GitlabLabels({
  data,
  error,
  layout = "list",
  cardColumns,
  cardMinWidth,
  gap,
  maxWidth,
  align,
}: GitlabLabelsProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  if (layout === "cards") {
    return (
      <div
        className="gitlab-label-cards"
        style={cardsGridStyle({ cardColumns, cardMinWidth, gap, maxWidth, align })}
      >
        {data.map((l) => (
          <a key={l.name} className="gitlab-card gitlab-label-card" href={l.webUrl}>
            <span className={badgeClassName(l)} style={badgeStyle(l)}>
              <LabelContent label={l} />
            </span>
            {l.description && <p className="gitlab-label-card-desc">{l.description}</p>}
          </a>
        ))}
      </div>
    );
  }
  return (
    <ul className="gitlab-labels">
      {data.map((l) => (
        <li key={l.name}>
          <a
            className={badgeClassName(l)}
            href={l.webUrl}
            title={l.description ?? undefined}
            style={badgeStyle(l)}
          >
            <LabelContent label={l} />
          </a>
        </li>
      ))}
    </ul>
  );
}
