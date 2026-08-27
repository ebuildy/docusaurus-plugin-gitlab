import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { FileCache } from "./cache";
import type { GitLabClient } from "./client";

// Keeps the asset dir non-empty even before any asset is downloaded.
// Docusaurus decides whether to copy a static directory when it CREATES the
// webpack config (StaticDirectoriesCopyPlugin skips a dir that is missing or
// has no entries), while our assets are only written later, during
// compilation — and copy-webpack-plugin aborts the build outright when the
// resulting `static/**/*` glob matches no file. A marker file makes both
// checks pass no matter when they run. See issue #45.
const MARKER = ".gitkeep";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export interface AssetManagerConfig {
  client: GitLabClient;
  cache: FileCache;
  assetDir: string;
  /** Durable byte store, inside the plugin's cache dir. `assetDir` lives under
   *  the site's gitignored `static/` tree and is treated as disposable: it is
   *  re-materialized from here rather than re-downloaded. */
  storeDir: string;
  assetBaseUrl: string;
  host: string;
}

export class AssetManager {
  constructor(private config: AssetManagerConfig) {}

  private absolute(src: string, ref: string, project: string): string {
    if (/^https?:\/\//i.test(src)) return src;
    const clean = src.replace(/^\.?\//, "");
    return `${this.config.host}/${project}/-/raw/${ref}/${clean}`;
  }

  private ext(url: string, contentType: string): string {
    const byType = EXT_BY_TYPE[contentType.split(";")[0].trim()];
    if (byType) return byType;
    const m = url.split("?")[0].match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : "bin";
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Create the asset dir and its marker file. Idempotent. */
  async ensureDir(): Promise<void> {
    await mkdir(this.config.assetDir, { recursive: true });
    const marker = join(this.config.assetDir, MARKER);
    if (!(await this.exists(marker))) await writeFile(marker, "");
  }

  /** True once `assetDir` holds the file, restoring it from the store if needed. */
  private async materialize(filename: string): Promise<boolean> {
    const dest = join(this.config.assetDir, filename);
    if (await this.exists(dest)) return true;
    const source = join(this.config.storeDir, filename);
    if (!(await this.exists(source))) return false;
    await this.ensureDir();
    await copyFile(source, dest);
    return true;
  }

  /**
   * Re-materialize `assetDir` from the store.
   *
   * The fetchers memoize the *rendered HTML*, which already points at
   * `/gitlab-assets/<hash>.<ext>` — so a cache hit hands back markup that
   * references assets without ever calling `localize`. Restoring a deleted
   * asset dir therefore cannot be driven from `localize`; it has to happen once,
   * up front, before any page is rendered.
   */
  async sync(): Promise<void> {
    await this.ensureDir();
    let stored: string[];
    try {
      stored = await readdir(this.config.storeDir);
    } catch {
      return; // nothing downloaded yet
    }
    await Promise.all(stored.map((name) => this.materialize(name)));
  }

  async localize(src: string, ref: string, project: string): Promise<string> {
    const url = this.absolute(src, ref, project);

    const cacheKey = `asset:${url}`;
    const cached = await this.config.cache.get<string>(cacheKey);
    // The cache memoizes a side effect on disk, so a hit is only usable once the
    // file it points at is back in place — restored from the store, or (if that
    // is gone too) re-downloaded below.
    if (cached && (await this.materialize(basename(cached)))) return cached;

    const { body, contentType } = await this.config.client.requestBinary(url);
    const buf = Buffer.from(body);
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 24);
    const filename = `${hash}.${this.ext(url, contentType)}`;

    await mkdir(this.config.storeDir, { recursive: true });
    await writeFile(join(this.config.storeDir, filename), buf);
    await this.ensureDir();
    await writeFile(join(this.config.assetDir, filename), buf);

    const served = `${this.config.assetBaseUrl}/${filename}`;
    await this.config.cache.set(cacheKey, served);
    return served;
  }
}
