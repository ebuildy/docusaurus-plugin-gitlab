import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
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

function manager(client: any) {
  return new AssetManager({
    client,
    cache: new FileCache(join(dir, "cache"), { ttl: 3600 }),
    assetDir: join(dir, "assets"),
    storeDir: join(dir, "store"),
    assetBaseUrl: "/gitlab-assets",
    host: "https://gitlab.com",
  });
}

describe("AssetManager", () => {
  it("resolves a relative path to the GitLab raw URL before downloading", async () => {
    const client = fakeClient(new Uint8Array([1]));
    const am = new AssetManager({
      client,
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      storeDir: join(dir, "store"),
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
      storeDir: join(dir, "store"),
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
      storeDir: join(dir, "store"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    const a = await am.localize("https://x/y.png", "main", "g/r");
    const b = await am.localize("https://x/y.png", "main", "g/r");
    expect(a).toBe(b);
    expect(client.requestBinary).toHaveBeenCalledTimes(1);
  });

  it("restores a deleted asset from the store instead of re-downloading it", async () => {
    // `static/gitlab-assets` is a gitignored build artifact users delete. The
    // durable copy lives in the plugin cache dir next to the memoized fetcher
    // results, so the two can only be thrown away together. See issue #45.
    const client = fakeClient(new Uint8Array([7]));
    const am = manager(client);
    const first = await am.localize("https://x/y.png", "main", "g/r");
    rmSync(join(dir, "assets"), { recursive: true });

    const second = await am.localize("https://x/y.png", "main", "g/r");
    expect(second).toBe(first);
    expect(client.requestBinary).toHaveBeenCalledTimes(1);
    expect(existsSync(join(dir, "assets", basename(second)))).toBe(true);
  });

  it("re-downloads when the store copy is gone too", async () => {
    const client = fakeClient(new Uint8Array([7]));
    const am = manager(client);
    const first = await am.localize("https://x/y.png", "main", "g/r");
    rmSync(join(dir, "assets"), { recursive: true });
    rmSync(join(dir, "store"), { recursive: true });

    const second = await am.localize("https://x/y.png", "main", "g/r");
    expect(second).toBe(first);
    expect(client.requestBinary).toHaveBeenCalledTimes(2);
    expect(existsSync(join(dir, "assets", basename(second)))).toBe(true);
  });

  it("sync() restores stored assets that localize() would never be asked for", async () => {
    // The fetchers memoize the *rendered HTML*, which already points at
    // /gitlab-assets/<hash>.png — so a cache hit returns markup referencing
    // assets without ever calling localize(). Restoring the dir therefore
    // cannot be driven from localize(); it has to happen up front.
    const client = fakeClient(new Uint8Array([7]));
    const am = manager(client);
    const served = await am.localize("https://x/y.png", "main", "g/r");
    rmSync(join(dir, "assets"), { recursive: true });

    await am.sync();
    expect(existsSync(join(dir, "assets", basename(served)))).toBe(true);
    expect(client.requestBinary).toHaveBeenCalledTimes(1);
  });

  it("ensureDir creates the asset dir with a marker file", async () => {
    // Docusaurus snapshots `staticDirectories` when it builds the webpack config
    // — before our assets are written during compilation. A static dir that is
    // missing (or holds only empty dirs) at that moment is either skipped, so the
    // assets never reach `build/`, or fails the `static/**/*` glob. The marker
    // guarantees the dir exists AND contains at least one file.
    const am = new AssetManager({
      client: fakeClient(new Uint8Array([1])),
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      storeDir: join(dir, "store"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    await am.ensureDir();
    expect(existsSync(join(dir, "assets", ".gitkeep"))).toBe(true);
  });

  it("localize leaves the marker in place so the dir is never file-less", async () => {
    const am = new AssetManager({
      client: fakeClient(new Uint8Array([1])),
      cache: new FileCache(join(dir, "cache"), { ttl: 60 }),
      assetDir: join(dir, "assets"),
      storeDir: join(dir, "store"),
      assetBaseUrl: "/gitlab-assets",
      host: "https://gitlab.com",
    });
    await am.localize("https://x/y.png", "main", "g/r");
    expect(existsSync(join(dir, "assets", ".gitkeep"))).toBe(true);
  });
});
