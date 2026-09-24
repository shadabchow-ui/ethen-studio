import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Two independent key spaces, so a test can decide whether the REST endpoint and
// the Redis URL are backed by the SAME logical database or by two different
// ones. Reachability alone is not identity, and that distinction is the whole
// point of the M0-J04 split-brain guard.
const restBacking = new Map<string, string>();
let redisBacking = restBacking;

const redisInstances: Array<{
  url: string;
  ping: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("ioredis", () => {
  class Redis {
    url: string;
    ping = vi.fn().mockResolvedValue("PONG");
    disconnect = vi.fn();
    quit = vi.fn();
    get = vi.fn(async (key: string) => redisBacking.get(key) ?? null);
    set = vi.fn(async (key: string, value: string) => {
      redisBacking.set(key, value);
      return "OK";
    });
    del = vi.fn(async (key: string) => (redisBacking.delete(key) ? 1 : 0));
    eval = vi.fn();
    constructor(url: string) {
      this.url = url;
      redisInstances.push(this as unknown as (typeof redisInstances)[number]);
    }
  }
  return { Redis };
});

/** Minimal Upstash REST command server over `restBacking`. */
function upstashRestFetch(): typeof fetch {
  return vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const parts = JSON.parse(init?.body ?? "[]") as Array<string | number>;
    const [command, key, value] = parts as [string, string, string];
    let result: unknown = null;
    switch (command) {
      case "PING":
        result = "PONG";
        break;
      case "SET":
        restBacking.set(key, value);
        result = "OK";
        break;
      case "GET":
        result = restBacking.get(key) ?? null;
        break;
      case "DEL":
        result = restBacking.delete(key) ? 1 : 0;
        break;
      default:
        result = null;
    }
    return { ok: true, json: async () => ({ result }) };
  }) as unknown as typeof fetch;
}

import {
  createConfiguredCoordinationStore,
  CoordinationSplitBrainError,
  CoordinationUnavailableError,
} from "../coordination";

const REST_URL = "https://dead-rest-endpoint.upstash.io";
const REST_TOKEN = "rest-token";
const REDIS_URL = "rediss://live-host:6379";

describe("createConfiguredCoordinationStore", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    redisInstances.length = 0;
    restBacking.clear();
    // Default: both credential forms address the same logical database.
    redisBacking = restBacking;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("uses the Upstash REST store when it pings successfully and both forms agree", async () => {
    global.fetch = upstashRestFetch();

    const store = await createConfiguredCoordinationStore({
      UPSTASH_REDIS_REST_URL: REST_URL,
      UPSTASH_REDIS_REST_TOKEN: REST_TOKEN,
      REDIS_URL,
    });

    expect(store.backend).toBe("upstash-rest");
    // The identity probe reads back through the URL form, so exactly one
    // ioredis client is constructed for the check.
    expect(redisInstances).toHaveLength(1);
    // The probe cleans up after itself.
    expect([...restBacking.keys()].filter((key) => key.includes("same-instance-probe"))).toEqual([]);
  });

  it("uses the Upstash REST store with no identity probe when REST is the only form", async () => {
    global.fetch = upstashRestFetch();

    const store = await createConfiguredCoordinationStore({
      UPSTASH_REDIS_REST_URL: REST_URL,
      UPSTASH_REDIS_REST_TOKEN: REST_TOKEN,
    });

    expect(store.backend).toBe("upstash-rest");
    expect(redisInstances).toHaveLength(0);
  });

  it("fails closed when both forms are live but address different databases", async () => {
    global.fetch = upstashRestFetch();
    // A second, independent key space: both endpoints answer, neither shares
    // state. This is the split-brain the NXDOMAIN failover fix did not cover.
    redisBacking = new Map<string, string>();

    await expect(
      createConfiguredCoordinationStore({
        UPSTASH_REDIS_REST_URL: REST_URL,
        UPSTASH_REDIS_REST_TOKEN: REST_TOKEN,
        REDIS_URL,
      }),
    ).rejects.toBeInstanceOf(CoordinationSplitBrainError);
  });

  it("does not leak the probe sentinel into a split-brain error message", async () => {
    global.fetch = upstashRestFetch();
    redisBacking = new Map<string, string>();

    await expect(
      createConfiguredCoordinationStore({
        UPSTASH_REDIS_REST_URL: REST_URL,
        UPSTASH_REDIS_REST_TOKEN: REST_TOKEN,
        REDIS_URL,
      }),
    ).rejects.toThrow(/different logical Redis databases/);
  });

  it("falls back to REDIS_URL when the configured Upstash REST endpoint is unreachable (stale/NXDOMAIN)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    const store = await createConfiguredCoordinationStore({
      UPSTASH_REDIS_REST_URL: REST_URL,
      UPSTASH_REDIS_REST_TOKEN: REST_TOKEN,
      REDIS_URL,
    });

    expect(store.backend).toBe("ioredis");
    expect(redisInstances).toHaveLength(1);
    expect(redisInstances[0]?.url).toBe(REDIS_URL);
  });

  it("falls back to REDIS_URL when the Upstash REST endpoint returns a non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    const store = await createConfiguredCoordinationStore({
      UPSTASH_REDIS_REST_URL: REST_URL,
      UPSTASH_REDIS_REST_TOKEN: REST_TOKEN,
      REDIS_URL,
    });

    expect(store.backend).toBe("ioredis");
    expect(redisInstances[0]?.url).toBe(REDIS_URL);
  });

  it("throws when the REST endpoint is unreachable and no REDIS_URL fallback exists", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    await expect(
      createConfiguredCoordinationStore({
        UPSTASH_REDIS_REST_URL: REST_URL,
        UPSTASH_REDIS_REST_TOKEN: REST_TOKEN,
      }),
    ).rejects.toThrow();
    expect(redisInstances).toHaveLength(0);
  });

  it("uses REDIS_URL directly when no Upstash REST pair is configured", async () => {
    const store = await createConfiguredCoordinationStore({ REDIS_URL });
    expect(store.backend).toBe("ioredis");
    expect(redisInstances[0]?.url).toBe(REDIS_URL);
  });

  it("throws CoordinationUnavailableError when nothing is configured", async () => {
    await expect(createConfiguredCoordinationStore({})).rejects.toThrow(
      CoordinationUnavailableError,
    );
  });
});
