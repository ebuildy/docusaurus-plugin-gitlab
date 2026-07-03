import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabTopics } from "./GitlabTopics";

const topics = [
  { name: "docs", title: "Docs", totalProjectsCount: 3, webUrl: "https://x/explore/projects/topics/docs" },
];

describe("GitlabTopics", () => {
  it("renders each topic as a link with its project-count bubble", () => {
    render(<GitlabTopics data={topics as any} />);
    const link = screen.getByRole("link", { name: /Docs/ });
    expect(link).toHaveAttribute("href", "https://x/explore/projects/topics/docs");
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders a scoped topic as two separated segments plus its count bubble", () => {
    const scoped = [
      { name: "team::backend", title: "team::backend", totalProjectsCount: 7, webUrl: "https://x/explore/projects/topics/team::backend" },
    ];
    render(<GitlabTopics data={scoped as any} />);
    expect(screen.getByRole("link")).toHaveClass("gitlab-topic--scoped");
    expect(screen.getByText("team")).toHaveClass("gitlab-label-scope");
    expect(screen.getByText("backend")).toHaveClass("gitlab-label-value");
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabTopics error={{ message: "boom", project: "" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<GitlabTopics />);
    expect(container).toBeEmptyDOMElement();
  });
});
