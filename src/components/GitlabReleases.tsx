import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, ReleaseData } from "./types.js";

export function GitlabReleases({ data, error }: ComponentPayload<ReleaseData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className="gitlab-releases">
      {data.map((r) => (
        <li key={r.tagName} className="gitlab-release">
          <div className="gitlab-title">
            {r.name || r.tagName}
            {r.tagName !== r.name && <span className="gitlab-badge">{r.tagName}</span>}
            <span className="gitlab-muted"> · {new Date(r.releasedAt).toLocaleDateString()}</span>
          </div>
          <div className="gitlab-release-notes" dangerouslySetInnerHTML={{ __html: r.descriptionHtml }} />
          {r.assets.length > 0 && (
            <div className="gitlab-release-assets">
              {r.assets.map((a) => (
                <a key={a.url} className="gitlab-badge" href={a.url}>{a.name}</a>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
