import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabProjectInfo } from "./GitlabProjectInfo";

const data = {
  id: 1, path: "g/r", name: "My Repo", description: "A thing", webUrl: "https://gitlab.com/g/r",
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
});
