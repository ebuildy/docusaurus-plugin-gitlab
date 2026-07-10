import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RoadmapGantt } from "./RoadmapGantt";
import type { RoadmapData } from "./types";

const data: RoadmapData = {
  source: "epics", scale: "months", rangeStart: "2026-01-01", rangeEnd: "2026-04-01",
  ticks: [{ label: "Jan", offsetPct: 0 }, { label: "Feb", offsetPct: 33 }],
  groups: [{
    key: "Platform", title: "Platform",
    items: [{
      id: 1, iid: 1, title: "Auth", state: "opened", startDate: "2026-01-01", dueDate: "2026-02-01",
      webUrl: "https://x/1", color: "#1f75cb", progress: 60, parentId: null, parentTitle: "Platform",
      labels: [{ name: "backend", color: "#dbeafe", textColor: "#1e40af" }],
      offsetPct: 10, widthPct: 40,
    }],
  }],
};

describe("RoadmapGantt", () => {
  it("renders the scale header, group heading, and a positioned bar", () => {
    const { container } = render(<RoadmapGantt data={data} colorBy="source" showProgress showLabels />);
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByText("Jan")).toBeInTheDocument();
    const bar = container.querySelector(".gitlab-roadmap-bar") as HTMLElement;
    expect(bar).toHaveStyle({ left: "10%", width: "40%", backgroundColor: "#1f75cb" });
    expect(screen.getByRole("link", { name: /Auth/ })).toHaveAttribute("href", "https://x/1");
  });

  it("renders the progress fill only when showProgress is true", () => {
    const { container, rerender } = render(<RoadmapGantt data={data} colorBy="source" showProgress={false} showLabels={false} />);
    expect(container.querySelector(".gitlab-roadmap-progress")).toBeNull();
    rerender(<RoadmapGantt data={data} colorBy="source" showProgress showLabels={false} />);
    expect(container.querySelector(".gitlab-roadmap-progress")).toHaveStyle({ width: "60%" });
  });

  it("renders label chips only when showLabels is true", () => {
    const { queryByText, rerender } = render(<RoadmapGantt data={data} colorBy="source" showProgress={false} showLabels={false} />);
    expect(queryByText("backend")).toBeNull();
    rerender(<RoadmapGantt data={data} colorBy="source" showProgress={false} showLabels />);
    expect(queryByText("backend")).toBeInTheDocument();
  });
});
