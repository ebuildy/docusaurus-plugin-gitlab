import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabProjectGrid } from "./GitlabProjectGrid";

const projects = [
  { id: 1, name: "Acme Web", path: "acme-web", pathWithNamespace: "mygroup/acme-web", slug: "acme-web", description: "web app", webUrl: "https://x/mygroup/acme-web", starCount: 4, defaultBranch: "main", topics: [] },
  { id: 2, name: "Mobile", path: "acme-mobile", pathWithNamespace: "mygroup/team-x/acme-mobile", slug: "team-x/acme-mobile", description: null, webUrl: "https://x/mygroup/team-x/acme-mobile", starCount: 0, defaultBranch: "main", topics: [] },
];

describe("GitlabProjectGrid", () => {
  it("links each card to the project's slug, relative to the declaring folder-index page", () => {
    render(<GitlabProjectGrid data={projects as any} />);
    // Bare slug resolves against the declaring page's trailing-slash directory URL
    // (e.g. `/team/` + `acme-web` → `/team/acme-web`).
    expect(screen.getByRole("link", { name: /Acme Web/ })).toHaveAttribute("href", "acme-web");
    expect(screen.getByRole("link", { name: /Mobile/ })).toHaveAttribute("href", "team-x/acme-mobile");
  });

  it("shows description and star count", () => {
    render(<GitlabProjectGrid data={[projects[0]] as any} />);
    expect(screen.getByText("web app")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabProjectGrid error={{ message: "boom", project: "" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<GitlabProjectGrid />);
    expect(container).toBeEmptyDOMElement();
  });
});
