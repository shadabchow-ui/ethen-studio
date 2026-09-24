import type { DistributedStore } from "./types";
import { INCR_EXPIRE_SCRIPT, RELEASE_LOCK_SCRIPT } from "./upstash-rest";

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | number, ...args: Array<string | number>): Promise<unknown>;
  del(key: string): Promise<number>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  ping(): Promise<string>;
  quit(): Promise<unknown>;
};

export class IoRedisStore implements DistributedStore {
  readonly backend = "ioredis" as const;

  constructor(private readonly redis: RedisLike) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs && ttlMs > 0) {
      await this.redis.set(key, value, "PX", ttlMs);
      return;
    }
    await this.redis.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async incr(key: string, ttlMs?: number): Promise<number> {
    return Number(await this.eval(INCR_EXPIRE_SCRIPT, [key], [ttlMs ?? 0]));
  }

  async setNx(key: string, value: string, ttlMs: number): Promise<boolean> {
    const result = await this.redis.set(key, value, "PX", ttlMs, "NX");
    return result === "OK";
  }

  async eval(script: string, keys: string[], args: Array<string | number>): Promise<unknown> {
    return this.redis.eval(script, keys.length, ...keys, ...args);
  }

  async ping(): Promise<boolean> {
    const result = await this.redis.ping();
    return result === "PONG";
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export { RELEASE_LOCK_SCRIPT };
