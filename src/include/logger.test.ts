import docusaurusLogger from "@docusaurus/logger";
import { describe, it, expect, vi } from "vitest";
import { createIncludeLogger } from "./logger.js";

vi.mock("@docusaurus/logger", () => ({ default: { info: vi.fn() } }));

const info = (docusaurusLogger as unknown as { info: ReturnType<typeof vi.fn> }).info;

describe("createIncludeLogger", () => {
  it("returns a no-op logger when disabled (does not touch @docusaurus/logger)", async () => {
    info.mockClear();
    const log = await createIncludeLogger(false);
    expect(() => log.debug("anything")).not.toThrow();
    expect(info).not.toHaveBeenCalled();
  });

  it("routes debug messages through @docusaurus/logger with a prefix when enabled", async () => {
    info.mockClear();
    const log = await createIncludeLogger(true);
    log.debug("hello world");
    expect(info).toHaveBeenCalledWith("[gitlab-include] hello world");
  });
});
