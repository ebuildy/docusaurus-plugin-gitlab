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
    expect(screen.getByRole("link", { name: /bug/ })).toHaveAttribute(
      "href",
      "https://x/g/r/-/issues?label_name[]=bug",
    );
    expect(screen.getByText("Defect")).toBeInTheDocument();
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
