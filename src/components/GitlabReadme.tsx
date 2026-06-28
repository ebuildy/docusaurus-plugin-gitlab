import React from "react";
import { Fallback } from "./Fallback.js";
import type { ComponentPayload, ReadmeData } from "./types.js";

export function GitlabReadme({ data, error }: ComponentPayload<ReadmeData>) {
  if (error) return <Fallback error={error} />;
  if (!data) return null;
  return <div className="gitlab-readme" dangerouslySetInnerHTML={{ __html: data.html }} />;
}
