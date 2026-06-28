import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabReadme } from "./GitlabReadme";

describe("GitlabReadme", () => {
  it("renders the prebuilt html", () => {
    render(<GitlabReadme data={{ ref: "main", html: "<h1>Title</h1><p>body</p>" } as any} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabReadme error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
