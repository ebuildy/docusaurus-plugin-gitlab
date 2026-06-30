import type { TocEntry } from "./toc.js";

export type ProjectRef = string | number;

export interface ProjectInfoData {
  id: number;
  path: string;
  name: string;
  description: string | null;
  webUrl: string;
  starCount: number;
  forksCount: number;
  topics: string[];
  lastActivityAt: string;
  avatarUrl: string | null;
}

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface ReleaseData {
  name: string;
  tagName: string;
  releasedAt: string;
  descriptionHtml: string;
  upcomingRelease: boolean;
  assets: ReleaseAsset[];
}

export interface IssueData {
  iid: number;
  title: string;
  state: string;
  webUrl: string;
  labels: string[];
  authorName: string;
  authorWebUrl: string;
  createdAt: string;
}

export interface ReadmeData {
  ref: string;
  html: string;
  toc?: TocEntry[];
}

export interface FileMarkdownData {
  kind: "markdown";
  html: string;
  ref: string;
  path: string;
}

export interface FileCodeData {
  kind: "code";
  code: string;
  language: string;
  ref: string;
  path: string;
}

export type FileData = FileMarkdownData | FileCodeData;

export interface FetchError {
  message: string;
  project: string;
}

/** What every component receives: exactly one of these is set. */
export interface ComponentPayload<T> {
  data?: T;
  error?: FetchError;
}
