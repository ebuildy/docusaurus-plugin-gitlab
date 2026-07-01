import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, LabelData } from "./types.js";

interface GitlabLabelsProps extends ComponentPayload<LabelData[]> {
  layout?: "list" | "cards";
}

export function GitlabLabels({ data, error, layout = "list" }: GitlabLabelsProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  if (layout === "cards") {
    return (
      <div className="gitlab-label-cards">
        {data.map((l) => (
          <a key={l.name} className="gitlab-label-card" href={l.webUrl}>
            <span
              className="gitlab-badge gitlab-label"
              style={{ backgroundColor: l.color, color: l.textColor }}
            >
              {l.name}
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
            className="gitlab-badge gitlab-label"
            href={l.webUrl}
            title={l.description ?? undefined}
            style={{ backgroundColor: l.color, color: l.textColor }}
          >
            {l.name}
          </a>
        </li>
      ))}
    </ul>
  );
}
