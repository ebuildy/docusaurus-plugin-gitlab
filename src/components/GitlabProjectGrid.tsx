import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, GroupProjectData } from "./types.js";

export function GitlabProjectGrid({ data, error }: ComponentPayload<GroupProjectData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  // The declaring page is a folder index, served at a directory URL with a
  // trailing slash (e.g. `/team/`), so each generated child page (a sibling) is
  // reached with a bare relative slug (`<slug>` → `/team/<slug>`).
  return (
    <div className="gitlab-project-grid">
      {data.map((p) => (
        <a key={p.id} className="gitlab-project-card" href={p.slug}>
          <span className="gitlab-project-card__name">{p.name}</span>
          {p.description ? (
            <span className="gitlab-project-card__desc">{p.description}</span>
          ) : null}
          <span className="gitlab-project-card__stars">{p.starCount}</span>
        </a>
      ))}
    </div>
  );
}
