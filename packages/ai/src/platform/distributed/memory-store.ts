import type { DistributedStore } from "./types";

interface MemoryEntry {
  value: string;
  expiresAt: number | null;
}

/**
 * Shared in-process store. Tests can pass the same Map to two "instances"
 * to prove cross-instance behavior without Redis.
 */
export class MemoryDistributedStore implements DistributedStore {
  readonly backend = "memory" as const;

  constructor(
    private readonly entries: Map<string, MemoryEntry> = new Map(),
    private readonly now: () => number = Date.now,
  ) {}

  private read(key: string): MemoryEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  async get(key: string): Promise<string | null> {
    return this.read(key)?.value ?? null;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: ttlMs && ttlMs > 0 ? this.now() + ttlMs : null,
    });
  }

  async del(key: string): Promise<number> {
    return this.entries.delete(key) ? 1 : 0;
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    const current = this.read(key);
    const next = String((current ? Number(current.value) || 0 : 0) + 1);
    const expiresAt =
      current?.expiresAt ?? (ttlMs && ttlMs > 0 ? this.now() + ttlMs : null);
    this.entries.set(key, { value: next, expiresAt });
    return Number(next);
  }

  async setNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (this.read(key)) return false;
    this.entries.set(key, {
      value,
      expiresAt: ttlMs > 0 ? this.now() + ttlMs : null,
    });
    return true;
  }

  async eval(script: string, keys: string[], args: Array<string | number>): Promise<unknown> {
    if (script.includes("INCR") && script.includes("PEXPIRE")) {
      return this.incr(keys[0]!, Number(args[0]));
    }
    if (script.includes("GET") && script.includes("DEL")) {
      const current = await this.get(keys[0]!);
      if (current === String(args[0])) return this.del(keys[0]!);
      return 0;
    }
    throw new Error("MemoryDistributedStore does not implement this eval script.");
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // Shared maps are owned by the caller.
  }
}
