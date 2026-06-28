import React from "react";
import { Fallback } from "./Fallback.js";
import styles from "./styles.module.css";
import type { ComponentPayload, ProjectInfoData } from "./types.js";

export function GitlabProjectInfo({ data, error, showStats = true }: ComponentPayload<ProjectInfoData> & { showStats?: boolean }) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <div className={styles.card}>
      <div className={styles.title}>
        <a href={data.webUrl}>{data.name}</a>
      </div>
      {data.description && <p className={styles.muted}>{data.description}</p>}
      {data.topics.length > 0 && (
        <div>
          {data.topics.map((t) => (
            <span key={t} className={styles.badge}>{t}</span>
          ))}
        </div>
      )}
      {showStats && (
        <div className={styles.stats}>
          <span>★ {data.starCount}</span>
          <span>⑂ {data.forksCount}</span>
          <span className={styles.muted}>updated {new Date(data.lastActivityAt).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
