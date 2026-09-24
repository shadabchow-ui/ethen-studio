import { randomUUID } from "node:crypto";
import {
  isProductionRuntime,
  isRedisConfigured,
  readTrimmedEnv,
} from "@ethen/config/env-contract";
import { MemoryDistributedStore } from "./memory-store";
import { IoRedisStore } from "./ioredis-store";
import { RELEASE_LOCK_SCRIPT, UpstashRestStore } from "./upstash-rest";
import type {
  CounterResult,
  DistributedStore,
  IdempotencyClaim,
  LockResult,
  RateLimitHit,
  ReplayDecision,
} from "./types";

const PREFIX = "ethen:coord";
const DEFAULT_TIMEOUT_MS = 1_500;

export interface CoordinationOptions {
  store?: DistributedStore;
  env?: Record<string, string | undefined>;
  now?: () => number;
  allowMemoryFallback?: boolean;
}

export class CoordinationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationUnavailableError";
  }
}

/**
 * M0-J04 (audit F-19) — both Redis credential forms are configured, both are
 * reachable, and they address DIFFERENT logical databases.
 *
 * This is the dangerous residual case the earlier NXDOMAIN failover fix did not
 * cover: nothing errors, so rate limits, locks, leases and idempotency claims
 * silently split across two stores depending on which code path resolved first.
 * Fail closed instead.
 */
export class CoordinationSplitBrainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoordinationSplitBrainError";
  }
}

const SAME_INSTANCE_PROBE_TTL_MS = 30_000;

/**
 * Prove the REST endpoint and the Redis URL address the same logical store by
 * writing a random sentinel through one and reading it back through the other.
 * Reachability is not identity — two live databases both answer PING.
 */
async function assertSameLogicalStore(
  rest: DistributedStore,
  direct: DistributedStore,
): Promise<void> {
  const key = namespaced(`same-instance-probe:${randomUUID()}`);
  const sentinel = randomUUID();
  try {
    await withTimeout(
      rest.set(key, sentinel, SAME_INSTANCE_PROBE_TTL_MS),
      DEFAULT_TIMEOUT_MS,
      "Redis same-instance probe write",
    );
    const observed = await withTimeout(
      direct.get(key),
      DEFAULT_TIMEOUT_MS,
      "Redis same-instance probe read",
    );
    if (observed !== sentinel) {
      throw new CoordinationSplitBrainError(
        "UPSTASH_REDIS_REST_URL and REDIS_URL address different logical Redis databases. " +
          "Distributed rate limits, locks, leases and idempotency would split across both. " +
          "Point both at the same database, or remove one.",
      );
    }
  } finally {
    // Best effort: a probe key expires on its own, so a cleanup failure must
    // never mask the identity result above.
    try {
      await withTimeout(rest.del(key), DEFAULT_TIMEOUT_MS, "Redis same-instance probe cleanup");
    } catch {
      /* probe key has a TTL */
    }
  }
}

let cachedStore: DistributedStore | null = null;
let cachedStoreKey: string | null = null;
const MEMORY_STORE_KEY = "__ethenCoordinationMemoryStore";

function getSharedMemoryStore(): MemoryDistributedStore {
  const scope = globalThis as typeof globalThis & {
    [MEMORY_STORE_KEY]?: MemoryDistributedStore;
  };
  if (!scope[MEMORY_STORE_KEY]) {
    scope[MEMORY_STORE_KEY] = new MemoryDistributedStore();
  }
  return scope[MEMORY_STORE_KEY]!;
}

function namespaced(key: string): string {
  return `${PREFIX}:${key}`;
}

export function createMemoryCoordinationStore(
  shared?: Map<string, { value: string; expiresAt: number | null }>,
  now?: () => number,
): MemoryDistributedStore {
  return new MemoryDistributedStore(shared, now);
}

async function connectIoRedis(url: string): Promise<DistributedStore> {
  const { Redis } = await import("ioredis");
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: DEFAULT_TIMEOUT_MS,
  });
  try {
    await withTimeout(client.ping(), DEFAULT_TIMEOUT_MS, "Redis ping");
  } catch (error) {
    client.disconnect();
    throw error;
  }
  return new IoRedisStore(client as unknown as ConstructorParameters<typeof IoRedisStore>[0]);
}

/**
 * Resolve the single coordination backend.
 *
 * Three rules, in order:
 *
 * 1. A stale/unreachable Upstash REST pair must not shadow a live REDIS_URL. If
 *    the REST endpoint fails its ping (e.g. NXDOMAIN from a deleted database),
 *    fall back to REDIS_URL/UPSTASH_REDIS_URL rather than throwing.
 * 2. If BOTH forms are configured and BOTH are reachable, they must be the same
 *    logical database — otherwise fail closed with CoordinationSplitBrainError
 *    (M0-J04 / audit F-19). Reachability is not identity.
 * 3. REST-only and URL-only configurations keep working unchanged, and never
 *    pay for the identity probe.
 */
export async function createConfiguredCoordinationStore(
  env: Record<string, string | undefined> = process.env,
): Promise<DistributedStore> {
  const restUrl = readTrimmedEnv("UPSTASH_REDIS_REST_URL", env);
  const restToken = readTrimmedEnv("UPSTASH_REDIS_REST_TOKEN", env);
  const url = readTrimmedEnv("REDIS_URL", env) || readTrimmedEnv("UPSTASH_REDIS_URL", env);

  if (restUrl && restToken) {
    const store = new UpstashRestStore(restUrl, restToken, DEFAULT_TIMEOUT_MS);
    try {
      await withTimeout(store.ping(), DEFAULT_TIMEOUT_MS, "Upstash REST ping");
    } catch (error) {
      // Rule 1 — REST is dead; a live URL takes over.
      if (!url) throw error;
      return connectIoRedis(url);
    }

    // Rule 3 — REST-only: nothing to reconcile against.
    if (!url) return store;

    // Rule 2 — both live: prove they are one store before serving either.
    let direct: DistributedStore;
    try {
      direct = await connectIoRedis(url);
    } catch {
      // The URL form is unreachable, so there is no second store to diverge
      // from. REST is the only live backend; use it.
      return store;
    }
    await assertSameLogicalStore(store, direct);
    return store;
  }

  if (url) {
    return connectIoRedis(url);
  }

  throw new CoordinationUnavailableError(
    "No Redis backend is configured (REDIS_URL, UPSTASH_REDIS_URL, or UPSTASH_REDIS_REST_URL + TOKEN).",
  );
}

export async function resolveCoordinationStore(
  options: CoordinationOptions = {},
): Promise<{ store: DistributedStore | null; unavailable: boolean; reason: string | null }> {
  if (options.store) {
    return { store: options.store, unavailable: false, reason: null };
  }

  const env = options.env ?? process.env;
  const production = isProductionRuntime(env);
  const allowMemory =
    options.allowMemoryFallback ?? (!production && options.allowMemoryFallback !== false);

  if (!isRedisConfigured(env)) {
    if (production || options.allowMemoryFallback === false) {
      return {
        store: null,
        unavailable: true,
        reason: "Redis is not configured; distributed coordination is unavailable.",
      };
    }
    if (allowMemory) {
      return {
        store: getSharedMemoryStore(),
        unavailable: false,
        reason: "Using in-process memory store because Redis is not configured.",
      };
    }
    return {
      store: null,
      unavailable: true,
      reason: "Redis is not configured and memory fallback is disabled.",
    };
  }

  const cacheKey = [
    readTrimmedEnv("UPSTASH_REDIS_REST_URL", env) ?? "",
    readTrimmedEnv("REDIS_URL", env) ?? "",
    readTrimmedEnv("UPSTASH_REDIS_URL", env) ?? "",
  ].join("|");

  if (cachedStore && cachedStoreKey === cacheKey) {
    return { store: cachedStore, unavailable: false, reason: null };
  }

  try {
    const store = await createConfiguredCoordinationStore(env);
    cachedStore = store;
    cachedStoreKey = cacheKey;
    return { store, unavailable: false, reason: null };
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message
        : "Redis backend failed to initialize.";
    if (production || options.allowMemoryFallback === false) {
      return { store: null, unavailable: true, reason };
    }
    return {
      store: getSharedMemoryStore(),
      unavailable: false,
      reason: `Redis unavailable; using in-process memory store. ${reason}`,
    };
  }
}

export function resetCoordinationCache(): void {
  cachedStore = null;
  cachedStoreKey = null;
}

export async function hitRateLimit(
  input: { key: string; max: number; windowMs: number },
  options: CoordinationOptions = {},
): Promise<RateLimitHit> {
  const resolved = await resolveCoordinationStore(options);
  if (!resolved.store) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: (options.now ?? Date.now)() + input.windowMs,
      count: 0,
      backend: "unavailable",
      unavailable: true,
      reason: resolved.reason,
    };
  }

  try {
    const count = await withTimeout(
      resolved.store.incr(namespaced(`rl:${input.key}`), input.windowMs),
      DEFAULT_TIMEOUT_MS,
      "rate-limit incr",
    );
    const allowed = count <= input.max;
    return {
      allowed,
      remaining: Math.max(0, input.max - count),
      resetAt: (options.now ?? Date.now)() + input.windowMs,
      count,
      backend: resolved.store.backend,
      unavailable: false,
      reason: allowed ? null : "rate_limit",
    };
  } catch (error) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: (options.now ?? Date.now)() + input.windowMs,
      count: 0,
      backend: "unavailable",
      unavailable: true,
      reason: error instanceof Error ? error.message : "rate-limit backend failed",
    };
  }
}

export async function acquireLock(
  input: { key: string; ttlMs: number; token?: string },
  options: CoordinationOptions = {},
): Promise<LockResult> {
  const resolved = await resolveCoordinationStore(options);
  if (!resolved.store) {
    return {
      acquired: false,
      token: null,
      expiresAt: null,
      backend: "unavailable",
      unavailable: true,
      reason: resolved.reason,
    };
  }

  const token = input.token ?? randomUUID();
  try {
    const acquired = await withTimeout(
      resolved.store.setNx(namespaced(`lock:${input.key}`), token, input.ttlMs),
      DEFAULT_TIMEOUT_MS,
      "lock acquire",
    );
    return {
      acquired,
      token: acquired ? token : null,
      expiresAt: acquired ? (options.now ?? Date.now)() + input.ttlMs : null,
      backend: resolved.store.backend,
      unavailable: false,
      reason: acquired ? null : "lock_held",
    };
  } catch (error) {
    return {
      acquired: false,
      token: null,
      expiresAt: null,
      backend: "unavailable",
      unavailable: true,
      reason: error instanceof Error ? error.message : "lock backend failed",
    };
  }
}

export async function releaseLock(
  input: { key: string; token: string },
  options: CoordinationOptions = {},
): Promise<boolean> {
  const resolved = await resolveCoordinationStore(options);
  if (!resolved.store) return false;
  const result = await resolved.store.eval(
    RELEASE_LOCK_SCRIPT,
    [namespaced(`lock:${input.key}`)],
    [input.token],
  );
  return Number(result) === 1;
}

export async function consumeReplayNonce(
  input: { key: string; ttlMs: number },
  options: CoordinationOptions = {},
): Promise<ReplayDecision> {
  const resolved = await resolveCoordinationStore(options);
  if (!resolved.store) {
    return {
      accepted: false,
      backend: "unavailable",
      unavailable: true,
      reason: resolved.reason,
    };
  }
  try {
    const accepted = await withTimeout(
      resolved.store.setNx(namespaced(`nonce:${input.key}`), "1", input.ttlMs),
      DEFAULT_TIMEOUT_MS,
      "replay nonce",
    );
    return {
      accepted,
      backend: resolved.store.backend,
      unavailable: false,
      reason: accepted ? null : "replay",
    };
  } catch (error) {
    return {
      accepted: false,
      backend: "unavailable",
      unavailable: true,
      reason: error instanceof Error ? error.message : "replay backend failed",
    };
  }
}

export async function claimIdempotency(
  input: { key: string; ttlMs: number },
  options: CoordinationOptions = {},
): Promise<IdempotencyClaim> {
  const resolved = await resolveCoordinationStore(options);
  if (!resolved.store) {
    return {
      status: "claimed",
      value: null,
      backend: "unavailable",
      unavailable: true,
      reason: resolved.reason,
    };
  }

  const key = namespaced(`idem:${input.key}`);
  try {
    const existing = await resolved.store.get(key);
    if (existing) {
      if (existing.startsWith("done:")) {
        return {
          status: "replay",
          value: existing.slice("done:".length),
          backend: resolved.store.backend,
          unavailable: false,
          reason: null,
        };
      }
      return {
        status: "in_progress",
        value: null,
        backend: resolved.store.backend,
        unavailable: false,
        reason: null,
      };
    }
    const claimed = await resolved.store.setNx(key, "pending", input.ttlMs);
    if (!claimed) {
      const raced = await resolved.store.get(key);
      if (raced?.startsWith("done:")) {
        return {
          status: "replay",
          value: raced.slice("done:".length),
          backend: resolved.store.backend,
          unavailable: false,
          reason: null,
        };
      }
      return {
        status: "in_progress",
        value: null,
        backend: resolved.store.backend,
        unavailable: false,
        reason: null,
      };
    }
    return {
      status: "claimed",
      value: null,
      backend: resolved.store.backend,
      unavailable: false,
      reason: null,
    };
  } catch (error) {
    return {
      status: "claimed",
      value: null,
      backend: "unavailable",
      unavailable: true,
      reason: error instanceof Error ? error.message : "idempotency backend failed",
    };
  }
}

export async function completeIdempotency(
  input: { key: string; value: string; ttlMs: number },
  options: CoordinationOptions = {},
): Promise<void> {
  const resolved = await resolveCoordinationStore(options);
  if (!resolved.store) return;
  await resolved.store.set(namespaced(`idem:${input.key}`), `done:${input.value}`, input.ttlMs);
}

export async function incrementCounter(
  input: { key: string; ttlMs?: number },
  options: CoordinationOptions = {},
): Promise<CounterResult> {
  const resolved = await resolveCoordinationStore(options);
  if (!resolved.store) {
    return {
      value: 0,
      backend: "unavailable",
      unavailable: true,
      reason: resolved.reason,
    };
  }
  try {
    const value = await withTimeout(
      resolved.store.incr(namespaced(`ctr:${input.key}`), input.ttlMs),
      DEFAULT_TIMEOUT_MS,
      "counter incr",
    );
    return {
      value,
      backend: resolved.store.backend,
      unavailable: false,
      reason: null,
    };
  } catch (error) {
    return {
      value: 0,
      backend: "unavailable",
      unavailable: true,
      reason: error instanceof Error ? error.message : "counter backend failed",
    };
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
