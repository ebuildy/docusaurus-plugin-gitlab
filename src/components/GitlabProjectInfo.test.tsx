import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabProjectInfo } from "./GitlabProjectInfo";

const data = {
  id: 1, path: "g/r", name: "My Repo", descriptionHtml: "<p>A thing</p>", webUrl: "https://gitlab.com/g/r",
  starCount: 12, forksCount: 3, topics: ["docs", "tooling"], lastActivityAt: "2026-01-01T00:00:00Z", avatarUrl: null,
};

describe("GitlabProjectInfo", () => {
  it("renders project name, description, topics, and stats", () => {
    render(<GitlabProjectInfo data={data as any} />);
    expect(screen.getByText("My Repo")).toBeInTheDocument();
    expect(screen.getByText("A thing")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
  });

  it("renders markdown and emoji from the description html", () => {
    render(<GitlabProjectInfo data={{ ...data, descriptionHtml: "<p>A <strong>bold</strong> thing 🚀</p>" } as any} />);
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText(/🚀/)).toBeInTheDocument();
  });

  it("renders no description block when descriptionHtml is empty", () => {
    const { container } = render(<GitlabProjectInfo data={{ ...data, descriptionHtml: "" } as any} />);
    expect(container.querySelector(".gitlab-description")).toBeNull();
  });

  it("humanizes large star and fork counts", () => {
    render(<GitlabProjectInfo data={{ ...data, starCount: 6000, forksCount: 1500 } as any} />);
    expect(screen.getByText(/6k/)).toBeInTheDocument();
    expect(screen.getByText(/1.5k/)).toBeInTheDocument();
  });

  it("renders the fallback when given an error", () => {
    render(<GitlabProjectInfo error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders the avatar when avatarUrl is set", () => {
    render(<GitlabProjectInfo data={{ ...data, avatarUrl: "/gitlab-assets/a.png" } as any} />);
    const img = screen.getByRole("img", { name: "My Repo" });
    expect(img).toHaveAttribute("src", "/gitlab-assets/a.png");
  });

  it("renders no avatar when avatarUrl is null", () => {
    render(<GitlabProjectInfo data={data as any} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders compact release, commit, and issue lines after the description", () => {
    render(<GitlabProjectInfo data={{ ...data,
      releases: [{ name: "First", tagName: "v1.0", releasedAt: "2026-01-01T00:00:00Z", descriptionHtml: "", upcomingRelease: false, assets: [] }],
      commits: [{ shortId: "a1b2c3d", title: "fix: bug", webUrl: "https://gitlab.com/c/a1b2c3d", authorName: "Ada", createdAt: "2026-01-02T00:00:00Z" }],
      issues: [{ iid: 42, title: "Broken thing", state: "opened", webUrl: "https://gitlab.com/i/42", labels: [], authorName: "Ada", authorWebUrl: "", createdAt: "2026-01-03T00:00:00Z" }],
    } as any} />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("v1.0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "a1b2c3d" })).toHaveAttribute("href", "https://gitlab.com/c/a1b2c3d");
    expect(screen.getByText("fix: bug")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Broken thing/ })).toHaveAttribute("href", "https://gitlab.com/i/42");
  });

  it("renders no section blocks when arrays are absent", () => {
    const { container } = render(<GitlabProjectInfo data={data as any} />);
    expect(container.querySelector(".gitlab-section")).toBeNull();
  });

  it("overrides the title link when link is provided", () => {
    render(<GitlabProjectInfo data={data as any} link="https://example.com/app" />);
    expect(screen.getByRole("link", { name: "My Repo" })).toHaveAttribute("href", "https://example.com/app");
  });

  it("defaults the title link to the project webUrl", () => {
    render(<GitlabProjectInfo data={data as any} />);
    expect(screen.getByRole("link", { name: "My Repo" })).toHaveAttribute("href", "https://gitlab.com/g/r");
  });

  it("shows richer metadata in cards layout", () => {
    render(<GitlabProjectInfo issuesLayout="cards" data={{ ...data,
      issues: [{ iid: 42, title: "Broken thing", state: "opened", webUrl: "u", labels: [], authorName: "Ada", authorWebUrl: "", createdAt: "2026-01-03T00:00:00Z" }],
    } as any} />);
    expect(screen.getByText(/opened/)).toBeInTheDocument();
    expect(screen.getByText(/Ada/)).toBeInTheDocument();
  });

  it("renders a relative 'ago' date on each release, commit, and issue", () => {
    const { container } = render(<GitlabProjectInfo data={{ ...data,
      releases: [{ name: "First", tagName: "v1.0", releasedAt: "2020-01-01T00:00:00Z", descriptionHtml: "", upcomingRelease: false, assets: [] }],
      commits: [{ shortId: "a1b2c3d", title: "old", webUrl: "u", authorName: "Ada", createdAt: "2020-01-01T00:00:00Z" }],
      issues: [{ iid: 7, title: "Old", state: "opened", webUrl: "u", labels: [], authorName: "Ada", authorWebUrl: "", createdAt: "2020-01-01T00:00:00Z" }],
    } as any} />);
    for (const section of ["releases", "commits", "issues"]) {
      const date = container.querySelector(`.gitlab-section-${section} .gitlab-section-date`);
      expect(date?.textContent).toMatch(/ago/);
    }
  });

  it("appends stat pills when their data is present", () => {
    render(<GitlabProjectInfo data={{ ...data,
      commitCount: 1200, contributorsCount: 8, openIssuesCount: 12, repositorySize: 4404019,
    } as any} />);
    expect(screen.getByText(/1.2k commits/)).toBeInTheDocument();
    expect(screen.getByText(/8 contributors/)).toBeInTheDocument();
    expect(screen.getByText(/12 issues/)).toBeInTheDocument();
    expect(screen.getByText(/4.2 MB/)).toBeInTheDocument();
  });

  it("omits stat pills whose data is absent", () => {
    render(<GitlabProjectInfo data={data as any} />);
    expect(screen.queryByText(/commits/)).not.toBeInTheDocument();
    expect(screen.queryByText(/contributors/)).not.toBeInTheDocument();
  });

  it("hides all stats including new pills when showStats is false", () => {
    render(<GitlabProjectInfo showStats={false} data={{ ...data, commitCount: 1200 } as any} />);
    expect(screen.queryByText(/commits/)).not.toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });
});
