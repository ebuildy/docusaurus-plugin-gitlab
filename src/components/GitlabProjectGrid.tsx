import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, GroupProjectData } from "./types.js";

interface GridProps extends ComponentPayload<GroupProjectData[]> {
  basePath?: string;
}

export function GitlabProjectGrid({ data, error, basePath = "projects" }: GridProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <div className="gitlab-project-grid">
      {data.map((p) => (
        <a key={p.id} className="gitlab-project-card" href={`${basePath}/${p.slug}`}>
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
