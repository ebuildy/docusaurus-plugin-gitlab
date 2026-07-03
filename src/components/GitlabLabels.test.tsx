import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabLabels } from "./GitlabLabels";

const labels = [
  { name: "bug", color: "#d9534f", textColor: "#ffffff", description: "Defect", webUrl: "https://x/g/r/-/issues?label_name[]=bug" },
  { name: "feature", color: "#5cb85c", textColor: "#1a1a1a", description: null, webUrl: "https://x/g/r/-/issues?label_name[]=feature" },
];

describe("GitlabLabels", () => {
  it("defaults to the list layout: colored badge links, name only", () => {
    render(<GitlabLabels data={labels as any} />);
    const link = screen.getByRole("link", { name: "bug" });
    expect(link).toHaveAttribute("href", "https://x/g/r/-/issues?label_name[]=bug");
    expect(link).toHaveStyle({ backgroundColor: "#d9534f", color: "#ffffff" });
    expect(screen.queryByText("Defect")).not.toBeInTheDocument();
  });

  it("renders description text in the cards layout", () => {
    render(<GitlabLabels data={labels as any} layout="cards" />);
    const card = screen.getByRole("link", { name: /bug/ });
    expect(card).toHaveAttribute("href", "https://x/g/r/-/issues?label_name[]=bug");
    // reuse the shared project-card styling (border + shadow + hover)
    expect(card).toHaveClass("gitlab-card");
    expect(screen.getByText("Defect")).toBeInTheDocument();
  });

  it("renders a scoped label as two separated segments: colored scope, gray value", () => {
    const scoped = [
      { name: "Abilities::Performance", color: "#428bca", textColor: "#ffffff", description: null, webUrl: "https://x/g/r/-/issues?label_name[]=Abilities::Performance" },
    ];
    render(<GitlabLabels data={scoped as any} />);
    const link = screen.getByRole("link");
    const scope = screen.getByText("Abilities");
    const value = screen.getByText("Performance");
    expect(scope).toHaveClass("gitlab-label-scope");
    expect(scope).toHaveStyle({ backgroundColor: "#428bca", color: "#ffffff" });
    expect(value).toHaveClass("gitlab-label-value");
    // the value must not carry the label color — it gets the gray treatment via CSS
    expect(link).not.toHaveStyle({ backgroundColor: "#428bca" });
    // the whole badge is bordered with the scope color to tie the segments together
    expect(link).toHaveStyle({ borderColor: "#428bca" });
  });

  it("lays the cards grid into a fixed number of columns via cardColumns", () => {
    const { container } = render(<GitlabLabels data={labels as any} layout="cards" cardColumns={3} />);
    const grid = container.querySelector(".gitlab-label-cards");
    expect(grid).toHaveStyle({ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" });
  });

  it("makes the grid responsive with cardMinWidth when no fixed column count is given", () => {
    const { container } = render(<GitlabLabels data={labels as any} layout="cards" cardMinWidth="220px" />);
    const grid = container.querySelector(".gitlab-label-cards");
    expect(grid).toHaveStyle({ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" });
  });

  it("lets cardColumns win over cardMinWidth when both are given", () => {
    const { container } = render(
      <GitlabLabels data={labels as any} layout="cards" cardColumns={2} cardMinWidth="220px" />,
    );
    const grid = container.querySelector(".gitlab-label-cards");
    expect(grid).toHaveStyle({ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" });
  });

  it("applies gap, maxWidth and centers the grid via align", () => {
    const { container } = render(
      <GitlabLabels data={labels as any} layout="cards" gap="1.5rem" maxWidth="900px" align="center" />,
    );
    const grid = container.querySelector(".gitlab-label-cards");
    expect(grid).toHaveStyle({ gap: "1.5rem", maxWidth: "900px", marginLeft: "auto", marginRight: "auto" });
  });

  it("renders the fallback on error", () => {
    render(<GitlabLabels error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<GitlabLabels />);
    expect(container).toBeEmptyDOMElement();
  });
});
