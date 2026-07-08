import type { TocEntry } from "./toc.js";

export type ProjectRef = string | number;

export interface ProjectInfoData {
  id: number;
  path: string;
  name: string;
  /** Project description rendered to sanitized HTML (markdown + emoji); "" when absent. */
  descriptionHtml: string;
  webUrl: string;
  starCount: number;
  forksCount: number;
  topics: string[];
  lastActivityAt: string;
  avatarUrl: string | null;
  releases?: ReleaseData[];
  commits?: CommitData[];
  issues?: IssueData[];
  openIssuesCount?: number;
  commitCount?: number;
  repositorySize?: number;
  contributorsCount?: number;
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
  /** Release page URL (GitLab `_links.self`); absent if the API omits it. */
  webUrl?: string;
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

export interface CommitData {
  shortId: string;
  title: string;
  webUrl: string;
  authorName: string;
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

export interface TopicData {
  name: string;
  title: string;
  totalProjectsCount: number;
  webUrl: string;
}

export interface LabelData {
  name: string;
  color: string;
  textColor: string;
  description: string | null;
  webUrl: string;
}
