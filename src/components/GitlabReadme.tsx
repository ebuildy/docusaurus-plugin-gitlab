import React from "react";
import { Fallback } from "./Fallback.js";
import styles from "./styles.module.css";
import type { ComponentPayload, ReadmeData } from "./types.js";

export function GitlabReadme({ data, error }: ComponentPayload<ReadmeData>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return <div className={styles.readme} dangerouslySetInnerHTML={{ __html: data.html }} />;
}
