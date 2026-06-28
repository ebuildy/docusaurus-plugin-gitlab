import { mkdtempSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AssetManager } from "./assets";
import { FileCache } from "./cache";

function fakeClient(bytes: Uint8Array, contentType = "image/png") {
  return {
    requestBinary: vi.fn(async () => ({ body: bytes.buffer.slice(0), contentType })),
  } as any;
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "glassets-"));
});

describe("AssetManager", () => {
  it("resolves a relative path to the GitLab raw URL before downloading", async () => {
    const client = fakeClient(new Uint8Array([1]));
    const am = new AssetManager({
      client,
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    await am.localize("./docs/a.png", "main", "group/repo");
    expect(client.requestBinary).toHaveBeenCalledWith(
      "https://gitlab.com/group/repo/-/raw/main/docs/a.png",
    );
  });

  it("downloads an absolute url as-is (badge) and writes a hashed file", async () => {
    const client = fakeClient(new Uint8Array([9, 9, 9]), "image/svg+xml");
    const am = new AssetManager({
      client,
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    const served = await am.localize("https://gitlab.com/g/r/-/badges/main/pipeline.svg", "main", "g/r");
    expect(served).toMatch(/^\/gitlab-assets\/[0-9a-f]+\.svg$/);
    const file = join(dir, "assets", served.split("/").pop()!);
    expect(existsSync(file)).toBe(true);
    expect(new Uint8Array(await readFile(file))).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("does not re-download a url already in the map", async () => {
    const client = fakeClient(new Uint8Array([1]));
    const am = new AssetManager({
      client,
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    const a = await am.localize("https://x/y.png", "main", "g/r");
    const b = await am.localize("https://x/y.png", "main", "g/r");
    expect(a).toBe(b);
    expect(client.requestBinary).toHaveBeenCalledTimes(1);
  });
});
