import type { DistributedStore } from "./types";

const INCR_EXPIRE_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 and tonumber(ARGV[1]) > 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n
`;

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export class UpstashRestStore implements DistributedStore {
  readonly backend = "upstash-rest" as const;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly timeoutMs = 1_500,
  ) {}

  private async command(parts: Array<string | number>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parts),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Upstash REST rejected the command (${response.status}).`);
      }
      const payload = (await response.json()) as { result?: unknown; error?: string };
      if (payload.error) throw new Error(payload.error);
      return payload.result ?? null;
    } finally {
      clearTimeout(timer);
    }
  }

  async get(key: string): Promise<string | null> {
    const result = await this.command(["GET", key]);
    return result === null || result === undefined ? null : String(result);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs && ttlMs > 0) {
      await this.command(["SET", key, value, "PX", ttlMs]);
      return;
    }
    await this.command(["SET", key, value]);
  }

  async del(key: string): Promise<number> {
    return Number(await this.command(["DEL", key])) || 0;
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    return Number(await this.eval(INCR_EXPIRE_SCRIPT, [key], [ttlMs ?? 0]));
  }

  async setNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    const result = await this.command(["SET", key, value, "PX", ttlMs, "NX"]);
    return result === "OK";
  }

  async eval(script: string, keys: string[], args: Array<string | number>): Promise<unknown> {
    return this.command(["EVAL", script, keys.length, ...keys, ...args]);
  }

  async ping(): Promise<boolean> {
    const result = await this.command(["PING"]);
    return result === "PONG" || result === "OK";
  }

  async close(): Promise<void> {
    // REST has no persistent connection.
  }
}

export { INCR_EXPIRE_SCRIPT, RELEASE_LOCK_SCRIPT };
