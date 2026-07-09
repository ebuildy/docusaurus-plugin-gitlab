import { describe, it, expect } from "vitest";
import { formatBytes } from "./formatBytes.js";

describe("formatBytes", () => {
  it("formats zero and bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });
  it("formats KB, MB, GB with one decimal", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(4_404_019)).toBe("4.2 MB");
    expect(formatBytes(2_147_483_648)).toBe("2 GB");
  });
});
