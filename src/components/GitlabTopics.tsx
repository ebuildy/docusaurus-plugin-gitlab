import React from "react";
import { Fallback } from "./Fallback.js";
import { parseScopedLabel } from "./scopedLabel.js";
import type { ComponentPayload, TopicData } from "./types.js";

/**
 * Render the label of a topic badge. A scoped topic ("scope::value") splits
 * into two segments — the scope keeps the default badge background, the value
 * gets the dark-gray treatment (see `.gitlab-label-value` in theme.css).
 */
function TopicContent({ topic }: { topic: TopicData }) {
  const scoped = parseScopedLabel(topic.title);
  if (!scoped) return <>{topic.title}</>;
  return (
    <>
      <span className="gitlab-label-scope">{scoped.scope}</span>
      <span className="gitlab-label-value">{scoped.value}</span>
    </>
  );
}

export function GitlabTopics({ data, error }: ComponentPayload<TopicData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className="gitlab-topics">
      {data.map((t) => {
        const className = parseScopedLabel(t.title)
          ? "gitlab-badge gitlab-topic--scoped"
          : "gitlab-badge";
        return (
          <li key={t.name}>
            <a className={className} href={t.webUrl}>
              <TopicContent topic={t} />
              <span className="gitlab-count-bubble">{t.totalProjectsCount}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
