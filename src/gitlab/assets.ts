import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileCache } from "./cache";
import type { GitLabClient } from "./client";

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

  async localize(src: string, ref: string, project: string): Promise<string> {
    const url = this.absolute(src, ref, project);

    const cacheKey = `asset:${url}`;
    const cached = await this.config.cache.get<string>(cacheKey);
    if (cached) return cached;

    const { body, contentType } = await this.config.client.requestBinary(url);
    const buf = Buffer.from(body);
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 24);
    const filename = `${hash}.${this.ext(url, contentType)}`;

    await mkdir(this.config.assetDir, { recursive: true });
    await writeFile(join(this.config.assetDir, filename), buf);

    const served = `${this.config.assetBaseUrl}/${filename}`;
    await this.config.cache.set(cacheKey, served);
    return served;
  }
}
