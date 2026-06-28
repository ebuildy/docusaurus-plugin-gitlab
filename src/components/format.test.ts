import { describe, it, expect } from "vitest";
import { formatCount } from "./format.js";

describe("formatCount", () => {
  it("leaves counts below 1000 untouched", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(12)).toBe("12");
    expect(formatCount(999)).toBe("999");
  });

  it("abbreviates thousands with a trailing k", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1500)).toBe("1.5k");
    expect(formatCount(6000)).toBe("6k");
    expect(formatCount(6200)).toBe("6.2k");
    expect(formatCount(12500)).toBe("12.5k");
  });

  it("abbreviates millions with a trailing M", () => {
    expect(formatCount(1000000)).toBe("1M");
    expect(formatCount(1500000)).toBe("1.5M");
  });
});
