import "server-only";

export type LimiterDenialReason =
  | "rate_limit"
  | "concurrency_limit"
  | "budget_limit"
  | "limiter_unavailable"
  | "decision_record_failed";

export interface GatewayLimitRequest {
  projectId: string;
  actorId: string;
  requestId: string;
  traceId: string;
  reservationId: string;
  rateLimit: number;
  rateWindowMs: number;
  concurrencyLimit: number;
  reservedMicros: number;
  budgetLimitMicros: number;
  reservationTtlMs: number;
  paidPath: boolean;
  environment: string;
  bypassRequested?: boolean;
}

export interface GatewayLimitDecision {
  allowed: boolean;
  reason: "allowed" | LimiterDenialReason;
  reservationId: string | null;
  rateRemaining: number;
  concurrencyActive: number;
  reservedMicros: number;
  expiresAt: string | null;
}

export interface GatewayReservationSettlement {
  reservationId: string;
  reservedMicros: number;
  actualMicros: number;
  refundedMicros: number;
  outcome: "completed" | "aborted" | "failed";
}

export interface DistributedGatewayLimitStore {
  acquire(
    input: Omit<GatewayLimitRequest, "actorId" | "requestId" | "traceId" | "paidPath" | "environment" | "bypassRequested">,
    nowMs: number,
  ): Promise<Omit<GatewayLimitDecision, "reason"> & { reason: "allowed" | "rate_limit" | "concurrency_limit" | "budget_limit" }>;
  settle(
    reservationId: string,
    actualMicros: number,
    outcome: GatewayReservationSettlement["outcome"],
    nowMs: number,
  ): Promise<GatewayReservationSettlement | null>;
}

export interface GatewayLimitDecisionRecorder {
  record(
    input: GatewayLimitRequest,
    decision: GatewayLimitDecision,
  ): Promise<void>;
  recordSettlement(
    input: GatewayLimitRequest,
    settlement: GatewayReservationSettlement,
  ): Promise<void>;
}

export class DistributedGatewayLimiter {
  constructor(
    private readonly store: DistributedGatewayLimitStore,
    private readonly recorder: GatewayLimitDecisionRecorder,
    private readonly now: () => number = Date.now,
  ) {}

  async admit(input: GatewayLimitRequest): Promise<GatewayLimitDecision> {
    // SOL-06 invariant: production bypass flags are never authority.
    const bypassAllowed =
      input.bypassRequested === true && input.environment !== "production";
    if (bypassAllowed) {
      const decision: GatewayLimitDecision = {
        allowed: true,
        reason: "allowed",
        reservationId: null,
        rateRemaining: input.rateLimit,
        concurrencyActive: 0,
        reservedMicros: 0,
        expiresAt: null,
      };
      await this.recorder.record(input, decision);
      return decision;
    }

    let decision: GatewayLimitDecision;
    try {
      decision = await this.store.acquire(
        {
          projectId: input.projectId,
          reservationId: input.reservationId,
          rateLimit: input.rateLimit,
          rateWindowMs: input.rateWindowMs,
          concurrencyLimit: input.concurrencyLimit,
          reservedMicros: input.reservedMicros,
          budgetLimitMicros: input.budgetLimitMicros,
          reservationTtlMs: input.reservationTtlMs,
        },
        this.now(),
      );
    } catch {
      decision = {
        allowed: !input.paidPath,
        reason: input.paidPath ? "limiter_unavailable" : "allowed",
        reservationId: null,
        rateRemaining: 0,
        concurrencyActive: 0,
        reservedMicros: 0,
        expiresAt: null,
      };
    }

    try {
      await this.recorder.record(input, decision);
    } catch {
      if (decision.reservationId) {
        await this.store
          .settle(decision.reservationId, 0, "failed", this.now())
          .catch(() => null);
      }
      return {
        ...decision,
        allowed: false,
        reason: "decision_record_failed",
        reservationId: null,
        reservedMicros: 0,
      };
    }
    return decision;
  }

  async settle(
    input: GatewayLimitRequest,
    actualMicros: number,
    outcome: GatewayReservationSettlement["outcome"],
  ): Promise<GatewayReservationSettlement | null> {
    const settlement = await this.store.settle(
      input.reservationId,
      Math.max(0, actualMicros),
      outcome,
      this.now(),
    );
    if (settlement) await this.recorder.recordSettlement(input, settlement);
    return settlement;
  }
}

export function distributedLimiterEnabled(value = process.env.GATEWAY_DISTRIBUTED_LIMITER): boolean {
  return value === "enabled";
}

