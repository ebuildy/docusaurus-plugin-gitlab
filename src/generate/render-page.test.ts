import { describe, it, expect } from "vitest";
import { renderChildPage } from "./render-page.js";

const project = {
  id: 1, name: "Acme Web", path: "acme-web", pathWithNamespace: "mygroup/acme-web",
  slug: "acme-web", description: 'A "web" app', webUrl: "https://gitlab.com/mygroup/acme-web",
  starCount: 4, defaultBranch: "main", topics: [],
};

describe("renderChildPage", () => {
  it("emits frontmatter, the marker, and one component per section in order", () => {
    const out = renderChildPage(project as any, ["info", "readme"]);
    expect(out).toContain('title: "Acme Web"');
    expect(out).toContain('description: "A \\"web\\" app"');
    expect(out).toContain("AUTO-GENERATED");
    const info = out.indexOf('<GitlabProjectInfo project="mygroup/acme-web" />');
    const readme = out.indexOf('<GitlabReadme project="mygroup/acme-web" />');
    expect(info).toBeGreaterThan(-1);
    expect(readme).toBeGreaterThan(info);
  });

  it("omits the description key when the project has none", () => {
    const out = renderChildPage({ ...project, description: null } as any, ["readme"]);
    expect(out).not.toContain("description:");
  });

  it("maps every section name to its component", () => {
    const out = renderChildPage(project as any, ["info", "readme", "releases", "issues"]);
    expect(out).toContain("<GitlabProjectInfo ");
    expect(out).toContain("<GitlabReadme ");
    expect(out).toContain("<GitlabReleases ");
    expect(out).toContain("<GitlabIssues ");
  });
});
