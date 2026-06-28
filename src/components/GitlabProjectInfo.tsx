import React from "react";
import { Fallback } from "./Fallback.js";
import { formatCount } from "./format.js";
import type { ComponentPayload, ProjectInfoData } from "./types.js";

export function GitlabProjectInfo({ data, error, showStats = true }: ComponentPayload<ProjectInfoData> & { showStats?: boolean }) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <div className="gitlab-card">
      <div className="gitlab-card-header">
        {data.avatarUrl && (
          <img
            className="gitlab-avatar"
            src={data.avatarUrl}
            alt={data.name}
            width={32}
            height={32}
          />
        )}
        <div className="gitlab-title">
          <a href={data.webUrl}>{data.name}</a>
        </div>
      </div>
      {data.description && <p className="gitlab-muted">{data.description}</p>}
      {data.topics.length > 0 && (
        <div>
          {data.topics.map((t) => (
            <span key={t} className="gitlab-badge">{t}</span>
          ))}
        </div>
      )}
      {showStats && (
        <div className="gitlab-stats">
          <span>★ {formatCount(data.starCount)}</span>
          <span>⑂ {formatCount(data.forksCount)}</span>
          <span className="gitlab-muted">updated {new Date(data.lastActivityAt).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
