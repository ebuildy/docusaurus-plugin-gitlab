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
  createdAt: string;
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

export interface GroupProjectData {
  id: number;
  name: string;
  path: string;
  /** Full namespace path, e.g. "mygroup/team-x/acme-mobile". */
  pathWithNamespace: string;
  /** Path relative to the queried group root, e.g. "team-x/acme-mobile". Used
   *  as both the generated file path and the card link target. */
  slug: string;
  description: string | null;
  webUrl: string;
  starCount: number;
  defaultBranch: string | null;
  topics: string[];
}

/** A GitLab label reduced to what the roadmap renders. */
export interface LabelRef {
  name: string;
  color: string;
  textColor: string;
}

export type RoadmapSource = "epics" | "milestones";
export type RoadmapState = "opened" | "closed";
export type RoadmapScale = "quarters" | "months" | "weeks";

/** One epic/milestone normalized from the GitLab API. */
export interface RoadmapItemData {
  id: number;
  iid: number;
  title: string;
  state: RoadmapState;
  /** ISO `YYYY-MM-DD`, or null when the source has no such date. */
  startDate: string | null;
  dueDate: string | null;
  webUrl: string;
  /** Epic color (e.g. `#1f75cb`); absent for milestones. */
  color?: string;
  /** Completion 0..100; epics only, null when not derivable. */
  progress?: number | null;
  parentId?: number | null;
  parentTitle?: string | null;
  labels: LabelRef[];
}

/** An item after geometry: same fields plus its bar placement. */
export interface RoadmapPositionedItem extends RoadmapItemData {
  /** Bar left edge as a percentage of the timeline window (0..100). */
  offsetPct: number;
  /** Bar width as a percentage of the window (>0). */
  widthPct: number;
}

export interface ScaleTick {
  label: string;
  /** Tick position as a percentage of the window (0..100). */
  offsetPct: number;
  /** ISO `YYYY-MM-DD` of the tick boundary; lets a layout relabel/coarsen ticks. */
  date?: string;
}

export interface RoadmapGroup {
  key: string;
  /** Section heading; null for the single ungrouped bucket. */
  title: string | null;
  items: RoadmapPositionedItem[];
}

/** The fully positioned model the component renders — no math in React. */
export interface RoadmapData {
  source: RoadmapSource;
  scale: RoadmapScale;
  rangeStart: string; // ISO YYYY-MM-DD
  rangeEnd: string;
  ticks: ScaleTick[];
  groups: RoadmapGroup[];
}
