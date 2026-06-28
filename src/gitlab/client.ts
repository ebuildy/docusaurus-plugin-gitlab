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

export class GitLabClient {
  private readonly api: InstanceType<typeof Gitlab>;

  constructor(private config: GitLabClientConfig) {
    this.api = config.token
      ? new Gitlab({ host: config.host, token: config.token })
      : new Gitlab({ host: config.host });
  }

  async getProject(project: ProjectRef): Promise<any> {
    return this.api.Projects.show(project);
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

  async getFileRaw(project: ProjectRef, path: string, ref: string): Promise<string> {
    const raw = await this.api.RepositoryFiles.showRaw(project, path, ref);
    return typeof raw === "string" ? raw : await raw.text();
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
