import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabFile } from "./GitlabFile";

describe("GitlabFile", () => {
  it("renders sanitized html for markdown file data", () => {
    render(
      <GitlabFile
        data={{ kind: "markdown", html: "<h1>Title</h1><p>body</p>", ref: "main", path: "GUIDE.md" } as any}
      />,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("renders a highlighted code block with the file path as title", () => {
    const { container } = render(
      <GitlabFile
        data={{ kind: "code", code: "const x = 1;", language: "ts", ref: "main", path: "src/index.ts" } as any}
      />,
    );
    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    // prism splits code into token spans; assert the full code text is present.
    expect(pre?.textContent).toContain("const x = 1;");
  });

  it("renders the fallback on error", () => {
    render(<GitlabFile error={{ message: "boom", project: "g/r" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });
});
