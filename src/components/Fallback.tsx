import React from "react";
import styles from "./styles.module.css";
import type { FetchError } from "./types.js";

export function Fallback({ error }: { error: FetchError }) {
  return (
    <div className={styles.fallback} role="alert">
      GitLab data unavailable for <code>{error.project}</code>: {error.message}
    </div>
  );
}
