import React from "react";
import type { FetchError } from "./types.js";

export function Fallback({ error }: { error: FetchError }) {
  return (
    <div className="gitlab-fallback" role="alert">
      GitLab data unavailable for <code>{error.project}</code>: {error.message}
    </div>
  );
}
