import React from "react";
import { Fallback } from "./Fallback.js";
import styles from "./styles.module.css";
import type { ComponentPayload, IssueData } from "./types.js";

export function GitlabIssues({ data, error }: ComponentPayload<IssueData[]>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return (
    <ul className={styles.list}>
      {data.map((i) => (
        <li key={i.iid} className={styles.listItem}>
          <span className={styles.badge}>{i.state}</span>
          <a href={i.webUrl}>{i.title}</a>
          {i.labels.map((l) => (
            <span key={l} className={styles.badge}>{l}</span>
          ))}
          <span className={styles.muted}> · {i.authorName}</span>
        </li>
      ))}
    </ul>
  );
}
