import "server-only";

import {
  DistributedGatewayLimiter,
  type GatewayLimitRequest,
  type GatewayReservationSettlement,
} from "./limiter";
import { SupabaseGatewayLimitDecisionRecorder } from "./limiter-recorder";
import { createRedisGatewayLimitStore } from "./redis-limiter-store";

export interface GatewayLimiterLifecycle {
  limiter: DistributedGatewayLimiter;
  request: GatewayLimitRequest;
}

function positiveInteger(name: string): number {
  const raw = process.env[name]?.trim();
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be configured as a positive integer.`);
  }
  return value;
}

export async function createGatewayLimiterLifecycle(input: {
  projectId: string;
  actorId: string | null;
  requestId: string;
  traceId: string;
  environment: string;
}): Promise<GatewayLimiterLifecycle> {
  if (!input.actorId) {
    throw new Error("Distributed Gateway limiting requires an authenticated actor.");
  }
  const store = await createRedisGatewayLimitStore();
  const limiter = new DistributedGatewayLimiter(
    store,
    new SupabaseGatewayLimitDecisionRecorder(),
  );
  return {
    limiter,
    request: {
      ...input,
      actorId: input.actorId,
      reservationId: `${input.projectId}:${input.requestId}`,
      rateLimit: positiveInteger("GATEWAY_RATE_LIMIT_RPM"),
      rateWindowMs: 60_000,
      concurrencyLimit: positiveInteger("GATEWAY_CONCURRENCY_LIMIT"),
      reservedMicros: positiveInteger("GATEWAY_RESERVATION_MICROS"),
      budgetLimitMicros: positiveInteger("GATEWAY_BUDGET_LIMIT_MICROS"),
      reservationTtlMs: positiveInteger("GATEWAY_RESERVATION_TTL_MS"),
      paidPath: true,
    },
  };
}

export async function settleGatewayLimiterLifecycle(
  lifecycle: GatewayLimiterLifecycle | null,
  actualCostUsd: number | null,
  outcome: GatewayReservationSettlement["outcome"],
): Promise<void> {
  if (!lifecycle) return;
  const actualMicros =
    actualCostUsd == null
      ? lifecycle.request.reservedMicros
      : Math.max(0, Math.round(actualCostUsd * 1_000_000));
  await lifecycle.limiter.settle(lifecycle.request, actualMicros, outcome);
}
