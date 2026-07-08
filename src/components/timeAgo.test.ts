import { describe, it, expect } from "vitest";
import { timeAgo } from "./timeAgo.js";

const now = Date.parse("2026-07-08T00:00:00Z");

describe("timeAgo", () => {
  it("returns 'just now' for the current instant and the future", () => {
    expect(timeAgo("2026-07-08T00:00:00Z", now)).toBe("just now");
    expect(timeAgo("2026-07-09T00:00:00Z", now)).toBe("just now");
  });

  it("formats minutes and hours", () => {
    expect(timeAgo("2026-07-07T23:59:00Z", now)).toBe("1 minute ago");
    expect(timeAgo("2026-07-07T23:00:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-07-07T21:00:00Z", now)).toBe("3 hours ago");
  });

  it("formats days, weeks, months, and years with pluralization", () => {
    expect(timeAgo("2026-07-07T00:00:00Z", now)).toBe("1 day ago");
    expect(timeAgo("2026-07-01T00:00:00Z", now)).toBe("1 week ago");
    expect(timeAgo("2026-05-08T00:00:00Z", now)).toBe("2 months ago");
    expect(timeAgo("2025-07-08T00:00:00Z", now)).toBe("1 year ago");
    expect(timeAgo("2024-07-08T00:00:00Z", now)).toBe("2 years ago");
  });
});
