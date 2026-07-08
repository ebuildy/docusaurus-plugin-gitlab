import React from "react";
import { Fallback } from "./Fallback.js";
import { formatCount } from "./format.js";
import type { ComponentPayload, ProjectInfoData, ReleaseData, CommitData, IssueData } from "./types.js";

type SectionLayout = "list" | "cards";

interface ProjectInfoProps extends ComponentPayload<ProjectInfoData> {
  showStats?: boolean;
  link?: string;
  releasesLayout?: SectionLayout;
  commitsLayout?: SectionLayout;
  issuesLayout?: SectionLayout;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function Releases({ items, layout }: { items: ReleaseData[]; layout: SectionLayout }) {
  return (
    <div className="gitlab-section gitlab-section-releases">
      <div className="gitlab-section-title gitlab-muted">Releases</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((r) => (
          <li key={r.tagName} className="gitlab-section-item">
            <span className="gitlab-badge">{r.tagName}</span>
            <span className="gitlab-section-name"> {r.name || r.tagName}</span>
            {layout === "cards" && (
              <span className="gitlab-muted"> · {shortDate(r.releasedAt)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Commits({ items, layout }: { items: CommitData[]; layout: SectionLayout }) {
  return (
    <div className="gitlab-section gitlab-section-commits">
      <div className="gitlab-section-title gitlab-muted">Latest commits</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((c) => (
          <li key={c.shortId} className="gitlab-section-item">
            <a className="gitlab-commit-sha" href={c.webUrl}>{c.shortId}</a>
            <span className="gitlab-section-name"> {c.title}</span>
            <span className="gitlab-muted"> · {c.authorName} · {shortDate(c.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Issues({ items, layout }: { items: IssueData[]; layout: SectionLayout }) {
  return (
    <div className="gitlab-section gitlab-section-issues">
      <div className="gitlab-section-title gitlab-muted">Issues</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((i) => (
          <li key={i.iid} className="gitlab-section-item">
            <a className="gitlab-issue-title" href={i.webUrl}>#{i.iid} {i.title}</a>
            {layout === "cards" && (
              <span className="gitlab-muted"> · {i.state} · {i.authorName}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GitlabProjectInfo({
  data,
  error,
  showStats = true,
  link,
  releasesLayout = "list",
  commitsLayout = "list",
  issuesLayout = "list",
}: ProjectInfoProps) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <div className="gitlab-card">
      <div className="gitlab-card-header">
        {data.avatarUrl && (
          <img className="gitlab-avatar" src={data.avatarUrl} alt={data.name} width={32} height={32} />
        )}
        <div className="gitlab-title">
          <a href={link ?? data.webUrl}>{data.name}</a>
        </div>
      </div>
      {data.descriptionHtml && (
        <div
          className="gitlab-description gitlab-muted"
          dangerouslySetInnerHTML={{ __html: data.descriptionHtml }}
        />
      )}
      {data.releases && data.releases.length > 0 && (
        <Releases items={data.releases} layout={releasesLayout} />
      )}
      {data.commits && data.commits.length > 0 && (
        <Commits items={data.commits} layout={commitsLayout} />
      )}
      {data.issues && data.issues.length > 0 && (
        <Issues items={data.issues} layout={issuesLayout} />
      )}
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
