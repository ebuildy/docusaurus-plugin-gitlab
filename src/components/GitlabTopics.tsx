import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, TopicData } from "./types.js";

export function GitlabTopics({ data, error }: ComponentPayload<TopicData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className="gitlab-topics">
      {data.map((t) => (
        <li key={t.name}>
          <a className="gitlab-badge" href={t.webUrl}>
            {t.title}
            <span className="gitlab-count-bubble">{t.totalProjectsCount}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
