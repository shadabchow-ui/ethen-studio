import "server-only";

import type {
  DistributedGatewayLimitStore,
  GatewayLimitRequest,
  GatewayReservationSettlement,
} from "./limiter";

type RedisEval = {
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
};

const ACQUIRE_SCRIPT = `
local rate = redis.call('INCR', KEYS[1])
if rate == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if rate > tonumber(ARGV[2]) then return {0, 'rate_limit', 0, 0, 0} end
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[3])
for _, id in ipairs(expired) do
  local amount = tonumber(redis.call('HGET', KEYS[3], id) or '0')
  redis.call('DECRBY', KEYS[4], amount)
  redis.call('HDEL', KEYS[3], id)
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[3])
local active = redis.call('ZCARD', KEYS[2])
if active >= tonumber(ARGV[4]) then return {0, 'concurrency_limit', tonumber(ARGV[2]) - rate, active, 0} end
local reserved = tonumber(redis.call('GET', KEYS[4]) or '0')
if reserved + tonumber(ARGV[5]) > tonumber(ARGV[6]) then
  return {0, 'budget_limit', tonumber(ARGV[2]) - rate, active, reserved}
end
redis.call('ZADD', KEYS[2], ARGV[3] + tonumber(ARGV[7]), ARGV[8])
redis.call('HSET', KEYS[3], ARGV[8], ARGV[5])
redis.call('INCRBY', KEYS[4], ARGV[5])
redis.call('PEXPIRE', KEYS[2], ARGV[7] * 2)
redis.call('PEXPIRE', KEYS[3], ARGV[7] * 2)
redis.call('PEXPIRE', KEYS[4], ARGV[7] * 2)
return {1, 'allowed', tonumber(ARGV[2]) - rate, active + 1, tonumber(ARGV[5])}
`;

const SETTLE_SCRIPT = `
local amount = redis.call('HGET', KEYS[1], ARGV[1])
if not amount then return nil end
amount = tonumber(amount)
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('DECRBY', KEYS[3], amount)
local actual = math.min(amount, tonumber(ARGV[2]))
return {amount, actual, amount - actual}
`;

export class RedisGatewayLimitStore implements DistributedGatewayLimitStore {
  constructor(private readonly redis: RedisEval) {}

  async acquire(
    input: Omit<GatewayLimitRequest, "actorId" | "requestId" | "traceId" | "paidPath" | "environment" | "bypassRequested">,
    nowMs: number,
  ) {
    if (!input.reservationId.startsWith(`${input.projectId}:`)) {
      throw new Error("Gateway reservation IDs must be prefixed by project ID.");
    }
    const prefix = `ethen:gateway:limit:${input.projectId}`;
    const raw = await this.redis.eval(
      ACQUIRE_SCRIPT,
      4,
      `${prefix}:rate`,
      `${prefix}:leases`,
      `${prefix}:amounts`,
      `${prefix}:reserved`,
      input.rateWindowMs,
      input.rateLimit,
      nowMs,
      input.concurrencyLimit,
      input.reservedMicros,
      input.budgetLimitMicros,
      input.reservationTtlMs,
      input.reservationId,
    );
    const values = raw as Array<number | string>;
    const allowed = Number(values[0]) === 1;
    return {
      allowed,
      reason: String(values[1]) as "allowed" | "rate_limit" | "concurrency_limit" | "budget_limit",
      reservationId: allowed ? input.reservationId : null,
      rateRemaining: Math.max(0, Number(values[2])),
      concurrencyActive: Number(values[3]),
      reservedMicros: allowed ? input.reservedMicros : Number(values[4]),
      expiresAt: allowed ? new Date(nowMs + input.reservationTtlMs).toISOString() : null,
    };
  }

  async settle(
    reservationId: string,
    actualMicros: number,
    outcome: GatewayReservationSettlement["outcome"],
    nowMs: number,
  ): Promise<GatewayReservationSettlement | null> {
    const projectId = reservationId.split(":")[0];
    const prefix = `ethen:gateway:limit:${projectId}`;
    const raw = await this.redis.eval(
      SETTLE_SCRIPT,
      3,
      `${prefix}:amounts`,
      `${prefix}:leases`,
      `${prefix}:reserved`,
      reservationId,
      actualMicros,
      nowMs,
    );
    if (!raw) return null;
    const values = raw as number[];
    return {
      reservationId,
      reservedMicros: Number(values[0]),
      actualMicros: Number(values[1]),
      refundedMicros: Number(values[2]),
      outcome,
    };
  }
}

export async function createRedisGatewayLimitStore(): Promise<RedisGatewayLimitStore> {
  const url =
    process.env.REDIS_URL?.trim() ||
    process.env.UPSTASH_REDIS_URL?.trim();
  if (!url) throw new Error("Distributed Gateway limiter requires REDIS_URL or UPSTASH_REDIS_URL.");
  const { Redis } = await import("ioredis");
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
  });
  await client.ping();
  return new RedisGatewayLimitStore(client);
}
