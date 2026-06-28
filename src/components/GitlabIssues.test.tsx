import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabIssues } from "./GitlabIssues";

const issues = [
  { iid: 5, title: "Fix the bug", state: "opened", webUrl: "https://x/5",
    labels: ["bug"], authorName: "Ann", authorWebUrl: "https://x/ann", createdAt: "2026-01-01T00:00:00Z" },
];

describe("GitlabIssues", () => {
  it("renders issue title, state, labels, and link", () => {
    render(<GitlabIssues data={issues as any} />);
    const link = screen.getByRole("link", { name: /Fix the bug/ });
    expect(link).toHaveAttribute("href", "https://x/5");
    expect(screen.getByText("bug")).toBeInTheDocument();
    expect(screen.getByText("opened")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabIssues error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
