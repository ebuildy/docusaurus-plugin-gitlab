import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RoadmapTimeline } from "./RoadmapTimeline";
import type { RoadmapData } from "./types";

const data: RoadmapData = {
  source: "epics", scale: "months", rangeStart: "2026-01-01", rangeEnd: "2026-04-01", ticks: [],
  groups: [{
    key: "Platform", title: "Platform",
    items: [{
      id: 1, iid: 1, title: "Auth", state: "opened", startDate: "2026-01-01", dueDate: "2026-02-01",
      webUrl: "https://x/1", color: "#1f75cb", progress: 60, parentId: null, parentTitle: "Platform",
      labels: [{ name: "backend", color: "#dbeafe", textColor: "#1e40af" }],
      offsetPct: 0, widthPct: 33,
    }],
  }],
};

describe("RoadmapTimeline", () => {
  it("renders a vertical spine with group heading, card, and date range", () => {
    const { container } = render(<RoadmapTimeline data={data} colorBy="source" showProgress showLabels />);
    expect(container.querySelector(".gitlab-roadmap-timeline")).toBeInTheDocument();
    expect(screen.getByText("Platform")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Auth/ })).toHaveAttribute("href", "https://x/1");
    expect(screen.getByText(/2026-01-01/)).toBeInTheDocument();
    expect(container.querySelector(".gitlab-roadmap-meter")).toHaveStyle({ width: "60%" });
    expect(screen.getByText("backend")).toBeInTheDocument();
  });

  it("omits meter and labels when toggles are off", () => {
    const { container, queryByText } = render(
      <RoadmapTimeline data={data} colorBy="source" showProgress={false} showLabels={false} />,
    );
    expect(container.querySelector(".gitlab-roadmap-meter")).toBeNull();
    expect(queryByText("backend")).toBeNull();
  });
});
