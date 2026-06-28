import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface Entry<T> {
  expiresAt: number | null;
  value: T;
}

export class FileCache {
  constructor(
    private dir: string,
    private config: { ttl: number } | false,
  ) {}

  static hash(parts: (string | number)[]): string {
    return createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 32);
  }

  private file(key: string): string {
    return join(this.dir, `${FileCache.hash([key])}.json`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.config === false) return undefined;
    try {
      const raw = await readFile(this.file(key), "utf8");
      const entry = JSON.parse(raw) as Entry<T>;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) return undefined;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.config === false) return;
    await mkdir(this.dir, { recursive: true });
    const entry: Entry<T> = {
      expiresAt: this.config.ttl === 0 ? Date.now() : Date.now() + this.config.ttl * 1000,
      value,
    };
    await writeFile(this.file(key), JSON.stringify(entry), "utf8");
  }
}
