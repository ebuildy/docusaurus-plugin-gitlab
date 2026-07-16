import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { GitlabRoadmap } from "./GitlabRoadmap";
import type { RoadmapData } from "./types";

const data: RoadmapData = {
  source: "epics",
  scale: "months",
  rangeStart: "2026-01-01",
  rangeEnd: "2026-04-01",
  ticks: [{ label: "Jan", offsetPct: 0 }, { label: "Feb", offsetPct: 33 }, { label: "Mar", offsetPct: 66 }],
  groups: [
    {
      key: "all", title: null,
      items: [{
        id: 1, iid: 1, title: "Auth", state: "opened", startDate: "2026-01-01", dueDate: "2026-02-01",
        webUrl: "https://x/epics/1", color: "#1f75cb", progress: 60, parentId: null, parentTitle: null,
        labels: [{ name: "backend", color: "#dbeafe", textColor: "#1e40af" }],
        offsetPct: 0, widthPct: 33,
      }],
    },
  ],
};

describe("GitlabRoadmap", () => {
  it("renders the gantt layout by default", () => {
    const { container } = render(<GitlabRoadmap data={data} />);
    expect(container.querySelector(".gitlab-roadmap-gantt")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Auth" })).toHaveAttribute("href", "https://x/epics/1");
  });

  it("renders the timeline layout when layout='timeline'", () => {
    const { container } = render(<GitlabRoadmap data={data} layout="timeline" />);
    expect(container.querySelector(".gitlab-roadmap-timeline")).toBeInTheDocument();
  });

  it("renders the fallback on error", () => {
    render(<GitlabRoadmap error={{ message: "boom", project: "g" } as any} />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
  });

  it("renders nothing when there is no data", () => {
    const { container } = render(<GitlabRoadmap />);
    expect(container).toBeEmptyDOMElement();
  });
});
