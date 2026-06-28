import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, IssueData } from "./types.js";

export function GitlabIssues({ data, error }: ComponentPayload<IssueData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className="gitlab-issues">
      {data.map((i) => (
        <li key={i.iid} className="gitlab-issue">
          <span className="gitlab-issue-state" data-state={i.state}>{i.state}</span>
          <a className="gitlab-issue-title" href={i.webUrl}>{i.title}</a>
          {i.labels.map((l) => (
            <span key={l} className="gitlab-badge">{l}</span>
          ))}
          <span className="gitlab-muted"> · {i.authorName}</span>
        </li>
      ))}
    </ul>
  );
}
