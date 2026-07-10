import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, GroupProjectData } from "./types.js";

interface GridProps extends ComponentPayload<GroupProjectData[]> {
  /**
   * The declaring page's folder name. Each card links to `<linkBase>/<slug>`,
   * which resolves to the generated child page (a sibling of the declaring page)
   * under Docusaurus's default no-trailing-slash doc routes. Empty means the
   * children sit at the same URL depth as the declaring page.
   */
  linkBase?: string;
}

export function GitlabProjectGrid({ data, error, linkBase = "" }: GridProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  const href = (slug: string) => (linkBase ? `${linkBase}/${slug}` : slug);
  return (
    <div className="gitlab-project-grid">
      {data.map((p) => (
        <a key={p.id} className="gitlab-project-card" href={href(p.slug)}>
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
