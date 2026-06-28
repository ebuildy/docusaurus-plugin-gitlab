import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, IssueData } from "./types.js";

export function GitlabIssues({ data, error }: ComponentPayload<IssueData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className="gitlab-list">
      {data.map((i) => (
        <li key={i.iid} className="gitlab-list-item">
          <span className="gitlab-badge">{i.state}</span>
          <a href={i.webUrl}>{i.title}</a>
          {i.labels.map((l) => (
            <span key={l} className="gitlab-badge">{l}</span>
          ))}
          <span className="gitlab-muted"> · {i.authorName}</span>
        </li>
      ))}
    </ul>
  );
}
