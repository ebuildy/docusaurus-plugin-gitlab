import { describe, it, expect } from "vitest";
import { formatDate } from "./formatDate.js";

describe("formatDate", () => {
  it("formats an ISO date in a human, absolute form", () => {
    expect(formatDate("2020-05-01T12:00:00Z", "en-US")).toBe("May 1, 2020");
    expect(formatDate("2026-12-25T12:00:00Z", "en-US")).toBe("Dec 25, 2026");
  });

  it("does not echo the raw ISO string or a relative form", () => {
    const out = formatDate("2020-05-01T12:00:00Z", "en-US");
    expect(out).not.toContain("T00:00:00Z");
    expect(out).not.toMatch(/ago/);
  });
});
