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

  it("renders the fallback when given an error", () => {
    render(<GitlabProjectInfo error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
