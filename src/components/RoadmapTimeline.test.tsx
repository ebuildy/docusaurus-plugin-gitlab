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

  it("date-groups ungrouped data by year then quarter (the default)", () => {
    const item = (id: number, title: string, start: string): RoadmapData["groups"][0]["items"][0] => ({
      id, iid: id, title, state: "opened", startDate: start, dueDate: null,
      webUrl: `https://x/${id}`, labels: [], offsetPct: 0, widthPct: 10,
    });
    const ungrouped: RoadmapData = {
      source: "epics", scale: "quarters", rangeStart: "2026-01-01", rangeEnd: "2027-06-01", ticks: [],
      groups: [{ key: "all", title: null, items: [
        item(1, "Auth", "2026-01-15"),
        item(2, "Billing", "2026-05-01"),
        item(3, "Search", "2027-02-01"),
      ] }],
    };
    const { container } = render(<RoadmapTimeline data={ungrouped} colorBy="source" showProgress showLabels />);
    // Year headings (group-title) and quarter sub-headings.
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("2027")).toBeInTheDocument();
    expect(container.querySelectorAll(".gitlab-roadmap-subgroup-title")).toHaveLength(3); // 2026 Q1, 2026 Q2, 2027 Q1
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getAllByText("Q1")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Auth" })).toBeInTheDocument();
  });
});
