import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabReleases } from "./GitlabReleases";

const releases = [
  { name: "v1.0", tagName: "v1.0", releasedAt: "2026-01-01T00:00:00Z",
    descriptionHtml: "<p>First</p>", upcomingRelease: false,
    assets: [{ name: "bin", url: "https://x/bin" }] },
];

describe("GitlabReleases", () => {
  it("renders release name, tag, notes html, and assets", () => {
    render(<GitlabReleases data={releases as any} />);
    expect(screen.getByText("v1.0")).toBeInTheDocument();
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "bin" })).toHaveAttribute("href", "https://x/bin");
  });

  it("renders the fallback on error", () => {
    render(<GitlabReleases error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
