import React from "react";
import { Fallback } from "./Fallback.js";
import { formatCount } from "./format.js";
import { formatBytes } from "./formatBytes.js";
import { formatDate } from "./formatDate.js";
import type { ComponentPayload, ProjectInfoData, ReleaseData, CommitData, IssueData } from "./types.js";

type SectionLayout = "list" | "cards";

interface ProjectInfoProps extends ComponentPayload<ProjectInfoData> {
  showStats?: boolean;
  showLinks?: boolean;
  link?: string;
  releasesLayout?: SectionLayout;
  commitsLayout?: SectionLayout;
  issuesLayout?: SectionLayout;
}

/** Render `text` as a link to `href`, or as plain text when links are disabled. */
function MaybeLink({
  href,
  className,
  showLinks,
  children,
}: {
  href?: string;
  className: string;
  showLinks: boolean;
  children: React.ReactNode;
}) {
  if (showLinks && href) return <a className={className} href={href}>{children}</a>;
  return <span className={className}>{children}</span>;
}

function Releases({ items, layout, showLinks }: { items: ReleaseData[]; layout: SectionLayout; showLinks: boolean }) {
  return (
    <div className="gitlab-section gitlab-section-releases">
      <div className="gitlab-section-title gitlab-muted">Releases</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((r) => (
          <li key={r.tagName} className="gitlab-section-item">
            <span className="gitlab-badge">{r.tagName}</span>
            <MaybeLink className="gitlab-section-name" href={r.webUrl} showLinks={showLinks}> {r.name || r.tagName}</MaybeLink>
            <span className="gitlab-section-date gitlab-muted">{formatDate(r.releasedAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Commits({ items, layout, showLinks }: { items: CommitData[]; layout: SectionLayout; showLinks: boolean }) {
  return (
    <div className="gitlab-section gitlab-section-commits">
      <div className="gitlab-section-title gitlab-muted">Latest commits</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((c) => (
          <li key={c.shortId} className="gitlab-section-item">
            <MaybeLink className="gitlab-commit-sha" href={c.webUrl} showLinks={showLinks}>{c.shortId}</MaybeLink>
            <span className="gitlab-section-name"> {c.title}</span>
            <span className="gitlab-muted"> · {c.authorName}</span>
            <span className="gitlab-section-date gitlab-muted">{formatDate(c.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Issues({ items, layout, showLinks }: { items: IssueData[]; layout: SectionLayout; showLinks: boolean }) {
  return (
    <div className="gitlab-section gitlab-section-issues">
      <div className="gitlab-section-title gitlab-muted">Issues</div>
      <ul className="gitlab-section-list" data-layout={layout}>
        {items.map((i) => (
          <li key={i.iid} className="gitlab-section-item">
            <MaybeLink className="gitlab-issue-title" href={i.webUrl} showLinks={showLinks}>#{i.iid} {i.title}</MaybeLink>
            {layout === "cards" && (
              <span className="gitlab-muted"> · {i.state} · {i.authorName}</span>
            )}
            <span className="gitlab-section-date gitlab-muted">{formatDate(i.createdAt)}</span>
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
  showLinks = true,
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
          className="gitlab-description"
          dangerouslySetInnerHTML={{ __html: data.descriptionHtml }}
        />
      )}
      {data.topics.length > 0 && (
        <div>
          {data.topics.map((t) => (
            <span key={t} className="gitlab-badge">{t}</span>
          ))}
        </div>
      )}
      <div className="gitlab-path">{data.path}</div>
      {data.releases && data.releases.length > 0 && (
        <Releases items={data.releases} layout={releasesLayout} showLinks={showLinks} />
      )}
      {data.commits && data.commits.length > 0 && (
        <Commits items={data.commits} layout={commitsLayout} showLinks={showLinks} />
      )}
      {data.issues && data.issues.length > 0 && (
        <Issues items={data.issues} layout={issuesLayout} showLinks={showLinks} />
      )}
      {showStats && (
        <div className="gitlab-stats">
          <span>★ {formatCount(data.starCount)}</span>
          <span>⑂ {formatCount(data.forksCount)}</span>
          {typeof data.commitCount === "number" && (
            <span>⎇ {formatCount(data.commitCount)} commits</span>
          )}
          {typeof data.contributorsCount === "number" && (
            <span>👥 {formatCount(data.contributorsCount)} contributors</span>
          )}
          {typeof data.openIssuesCount === "number" && (
            <span>⊙ {formatCount(data.openIssuesCount)} issues</span>
          )}
          {typeof data.repositorySize === "number" && (
            <span>▤ {formatBytes(data.repositorySize)}</span>
          )}
          {data.createdAt && (
            <span className="gitlab-muted gitlab-section-date">created {formatDate(data.createdAt)} - updated {formatDate(data.lastActivityAt)}</span>
          )}
        </div>
      )}
    </div>
  );
}
