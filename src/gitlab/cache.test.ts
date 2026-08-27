import { mkdtempSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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

  it("ignores entries written by an older cache version", async () => {
    // An upgrade must not keep serving pre-v2 entries: they point at localized
    // image files that the (then non-existent) byte store cannot restore, so the
    // site would render <img> tags for files nobody will ever write. See #45.
    const c = new FileCache(dir, { ttl: 3600 });
    const legacy = join(dir, `${FileCache.hash(["readme:g/r"])}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(legacy, JSON.stringify({ expiresAt: Date.now() + 60_000, value: "stale" }));

    expect(await c.get("readme:g/r")).toBeUndefined();
  });
});
