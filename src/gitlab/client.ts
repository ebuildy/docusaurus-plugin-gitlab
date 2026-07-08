import { Gitlab } from "@gitbeaker/rest";
import type { ProjectRef } from "./types";

export interface GitLabClientConfig {
  host: string;
  token?: string;
}

export interface BinaryResponse {
  body: ArrayBuffer;
  contentType: string;
}

export interface IssuesQuery {
  state?: string;
  labels?: string;
  milestone?: string;
  limit: number;
}

/** Pagination for the topic/label list endpoints. Defaults cap the fetch at 500 items. */
export interface PageOptions {
  perPage?: number;
  maxPages?: number;
}

const DEFAULT_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 5; // 5 * 100 = 500 item ceiling

export class GitLabClient {
  private readonly api: InstanceType<typeof Gitlab>;

  constructor(private config: GitLabClientConfig) {
    this.api = config.token
      ? new Gitlab({ host: config.host, token: config.token })
      : new Gitlab({ host: config.host });
  }

  async getProject(project: ProjectRef, opts?: { statistics?: boolean }): Promise<any> {
    return opts ? this.api.Projects.show(project, opts) : this.api.Projects.show(project);
  }

  async getContributorsCount(project: ProjectRef): Promise<number | undefined> {
    const res: any = await this.api.Repositories.allContributors(project, {
      showExpanded: true,
      perPage: 1,
      maxPages: 1,
    } as any);
    const total = res?.paginationInfo?.total;
    return typeof total === "number" ? total : undefined;
  }

  async getReleases(project: ProjectRef, limit: number): Promise<any[]> {
    const releases = await this.api.ProjectReleases.all(project, { perPage: limit, maxPages: 1 });
    return releases.slice(0, limit);
  }

  async getIssues(project: ProjectRef, opts: IssuesQuery): Promise<any[]> {
    const issues = await this.api.Issues.all({
      projectId: project,
      state: opts.state,
      labels: opts.labels,
      milestone: opts.milestone,
      perPage: opts.limit,
      maxPages: 1,
    });
    return issues.slice(0, opts.limit);
  }

  async getCommits(project: ProjectRef, limit: number): Promise<any[]> {
    const commits = await this.api.Commits.all(project, { perPage: limit, maxPages: 1 });
    return commits.slice(0, limit);
  }

  async getFileRaw(project: ProjectRef, path: string, ref: string): Promise<string> {
    const raw = await this.api.RepositoryFiles.showRaw(project, path, ref);
    return typeof raw === "string" ? raw : await raw.text();
  }

  async getTopics(opts: PageOptions = {}): Promise<any[]> {
    return this.api.Topics.all({
      perPage: opts.perPage ?? DEFAULT_PER_PAGE,
      maxPages: opts.maxPages ?? DEFAULT_MAX_PAGES,
    });
  }

  async getProjectLabels(project: ProjectRef, opts: PageOptions = {}): Promise<any[]> {
    return this.api.ProjectLabels.all(project, {
      perPage: opts.perPage ?? DEFAULT_PER_PAGE,
      maxPages: opts.maxPages ?? DEFAULT_MAX_PAGES,
    });
  }

  async getGroupLabels(group: ProjectRef, opts: PageOptions = {}): Promise<any[]> {
    return this.api.GroupLabels.all(group, {
      perPage: opts.perPage ?? DEFAULT_PER_PAGE,
      maxPages: opts.maxPages ?? DEFAULT_MAX_PAGES,
    });
  }

  async getGroup(group: ProjectRef): Promise<any> {
    return this.api.Groups.show(group);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: "application/json" };
    if (this.config.token) h["PRIVATE-TOKEN"] = this.config.token;
    return h;
  }

  async requestBinary(absoluteUrl: string): Promise<BinaryResponse> {
    const res = await fetch(absoluteUrl, { headers: this.headers() });
    if (!res.ok) throw new Error(`GitLab asset ${res.status} for ${absoluteUrl}`);
    return {
      body: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }
}
