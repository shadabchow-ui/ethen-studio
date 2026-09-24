import "server-only";

let redisAdapter: RedisAdapterImpl | null = null;
let redisInitAttempted = false;

interface RedisAdapterImpl {
  publish(channel: string, message: string): Promise<boolean>;
  subscribe(channel: string, handler: (message: string) => void): Promise<() => void>;
  ping(): Promise<string | null>;
  disconnect(): Promise<void>;
}

interface RedisInitResult {
  available: boolean;
  reason: string | null;
}

function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim() || process.env.UPSTASH_REDIS_URL?.trim();
  return url || null;
}

async function initRedisAdapter(): Promise<RedisInitResult> {
  if (redisAdapter) return { available: true, reason: null };
  if (redisInitAttempted) return { available: false, reason: "Redis adapter initialization previously failed." };

  const url = getRedisUrl();
  if (!url) return { available: false, reason: "REDIS_URL or UPSTASH_REDIS_URL is not configured." };

  redisInitAttempted = true;

  try {
    const { Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5000,
    });
    await client.ping();
    redisAdapter = {
      async publish(channel: string, message: string): Promise<boolean> {
        try {
          await client.publish(channel, message);
          return true;
        } catch {
          return false;
        }
      },
      async subscribe(
        channel: string,
        handler: (message: string) => void,
      ): Promise<() => void> {
        const subscriber = client.duplicate();
        await subscriber.subscribe(channel);
        subscriber.on("message", (_ch: unknown, msg: unknown) => handler(String(msg)));
        return () => {
          subscriber.unsubscribe(channel).catch(() => {});
          void subscriber.disconnect();
        };
      },
      async ping(): Promise<string | null> {
        try {
          return await client.ping();
        } catch {
          return null;
        }
      },
      async disconnect(): Promise<void> {
        redisAdapter = null;
        redisInitAttempted = false;
        await client.quit().catch(() => {});
      },
    };
    return { available: true, reason: null };
  } catch {
    return { available: false, reason: "Redis client (ioredis) failed to initialize. Make sure ioredis is installed or the connection URL is valid." };
  }
}

export async function getRedisPublisher(): Promise<{
  publish: (channel: string, message: string) => Promise<boolean>;
  available: boolean;
  reason: string | null;
}> {
  const result = await initRedisAdapter();
  if (!result.available || !redisAdapter) {
    return { publish: async () => false, available: false, reason: result.reason };
  }
  return {
    publish: (ch, msg) => redisAdapter!.publish(ch, msg),
    available: true,
    reason: null,
  };
}

export async function getRedisSubscriber(): Promise<{
  subscribe: (channel: string, handler: (message: string) => void) => Promise<() => void>;
  available: boolean;
  reason: string | null;
}> {
  const result = await initRedisAdapter();
  if (!result.available || !redisAdapter) {
    return {
      subscribe: async (_ch, _h) => () => {},
      available: false,
      reason: result.reason,
    };
  }
  return {
    subscribe: (ch, h) => redisAdapter!.subscribe(ch, h),
    available: true,
    reason: null,
  };
}

export async function redisPing(): Promise<{ ok: boolean; reason: string | null }> {
  const result = await initRedisAdapter();
  if (!result.available || !redisAdapter) return { ok: false, reason: result.reason };
  const pong = await redisAdapter.ping();
  return { ok: pong === "PONG", reason: pong ? null : "Ping returned unexpected response." };
}

export async function redisDisconnect(): Promise<void> {
  if (redisAdapter) await redisAdapter.disconnect();
}
