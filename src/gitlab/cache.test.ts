import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { FileCache } from "./cache";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "glcache-"));
});

describe("FileCache", () => {
  it("returns undefined on a miss", async () => {
    const c = new FileCache(dir, { ttl: 60 });
    expect(await c.get("missing")).toBeUndefined();
  });

  it("stores and retrieves a value", async () => {
    const c = new FileCache(dir, { ttl: 60 });
    await c.set("k", { a: 1 });
    expect(await c.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("treats expired entries as a miss", async () => {
    const c = new FileCache(dir, { ttl: 0 });
    await c.set("k", { a: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(await c.get("k")).toBeUndefined();
  });

  it("never reads or writes when disabled", async () => {
    const c = new FileCache(dir, false);
    await c.set("k", { a: 1 });
    expect(await c.get("k")).toBeUndefined();
  });

  it("hashes keys deterministically", () => {
    expect(FileCache.hash(["a", "b"])).toBe(FileCache.hash(["a", "b"]));
    expect(FileCache.hash(["a", "b"])).not.toBe(FileCache.hash(["a", "c"]));
  });
});
