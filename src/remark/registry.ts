import {
  fetchProjectInfo,
  fetchReadme,
  fetchReleases,
  fetchIssues,
  fetchFile,
  fetchTopics,
  fetchLabels,
  fetchGroupProjects,
  fetchRoadmap,
  type GitLabContext,
} from "../gitlab/fetchers.js";

export type Fetcher = (ctx: GitLabContext, attrs: Record<string, unknown>) => Promise<unknown>;

export const COMPONENT_REGISTRY: Record<string, Fetcher> = {
  GitlabProjectInfo: fetchProjectInfo,
  GitlabReadme: fetchReadme,
  GitlabReleases: fetchReleases,
  GitlabIssues: fetchIssues,
  GitlabFile: fetchFile,
  GitlabTopics: fetchTopics,
  GitlabLabels: fetchLabels,
  GitlabProjectGrid: fetchGroupProjects,
  GitlabRoadmap: fetchRoadmap,
};
