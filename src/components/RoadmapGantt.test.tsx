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

  it("defaults to page fit: fixed width, no content min-width", () => {
    const { container } = render(<RoadmapGantt data={data} colorBy="source" showProgress showLabels />);
    const root = container.querySelector(".gitlab-roadmap-gantt") as HTMLElement;
    expect(root).toHaveClass("gitlab-roadmap-fit-page");
    expect(root.style.minWidth).toBe("");
  });

  it("content fit expands with a min-width sized to the tick count", () => {
    const { container } = render(<RoadmapGantt data={data} colorBy="source" showProgress showLabels layoutFit="content" />);
    const root = container.querySelector(".gitlab-roadmap-gantt") as HTMLElement;
    expect(root).toHaveClass("gitlab-roadmap-fit-content");
    // 12.5rem label column + 2 ticks × 3rem = 18.5rem (jsdom collapses the calc sum).
    expect(root.style.minWidth).toBe("calc(18.5rem)");
  });

  it("page fit thins a dense monthly scale down to year labels", () => {
    const months = Array.from({ length: 48 }, (_, i) => {
      const y = 2026 + Math.floor(i / 12);
      const m = String((i % 12) + 1).padStart(2, "0");
      return { label: "M", offsetPct: (i / 48) * 100, date: `${y}-${m}-01` };
    });
    const dense: RoadmapData = { ...data, ticks: months };
    const { container } = render(<RoadmapGantt data={dense} colorBy="source" showProgress showLabels layoutFit="page" />);
    const labels = [...container.querySelectorAll(".gitlab-roadmap-tick")].map((n) => n.textContent);
    expect(labels).toEqual(["2026", "2027", "2028", "2029"]);
  });
});
