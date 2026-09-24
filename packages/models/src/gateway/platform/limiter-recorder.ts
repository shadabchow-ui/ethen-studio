import "server-only";

import { createServiceClient } from "@ethen/database/service";
import type {
  GatewayLimitDecision,
  GatewayLimitDecisionRecorder,
  GatewayLimitRequest,
  GatewayReservationSettlement,
} from "./limiter";

export class SupabaseGatewayLimitDecisionRecorder
implements GatewayLimitDecisionRecorder {
  async record(
    input: GatewayLimitRequest,
    decision: GatewayLimitDecision,
  ): Promise<void> {
    const service = createServiceClient();
    if (!service) throw new Error("Gateway limiter decision storage is unavailable.");
    const { data: project, error: projectError } = await service
      .from("projects")
      .select("organization_id")
      .eq("id", input.projectId)
      .single();
    if (projectError || !project) {
      throw new Error(projectError?.message ?? "Gateway project was not found.");
    }
    const metadata = {
      allowed: decision.allowed,
      reason: decision.reason,
      reservation_id: decision.reservationId,
      reserved_micros: decision.reservedMicros,
      rate_remaining: decision.rateRemaining,
      concurrency_active: decision.concurrencyActive,
      expires_at: decision.expiresAt,
    };
    const [{ error: usageError }, { error: auditError }] = await Promise.all([
      service.from("gateway_usage_events").insert({
        project_id: input.projectId,
        user_id: input.actorId,
        trace_id: input.traceId,
        event_type: "gateway.limit.decision",
        estimated_cost_usd: decision.reservedMicros / 1_000_000,
        metadata,
      }),
      service.from("governance_audit_events").insert({
        id: crypto.randomUUID(),
        organization_id: String(
          (project as Record<string, unknown>).organization_id,
        ),
        project_id: input.projectId,
        actor_id: input.actorId,
        action: "gateway.limit.admission",
        resource_type: "gateway_request",
        resource_id: input.requestId,
        policy: metadata,
        outcome: decision.allowed ? "allowed" : "denied",
        trace_id: input.traceId,
      }),
    ]);
    if (usageError || auditError) {
      throw new Error(
        usageError?.message ?? auditError?.message ?? "Limiter decision recording failed.",
      );
    }
  }

  async recordSettlement(
    input: GatewayLimitRequest,
    settlement: GatewayReservationSettlement,
  ): Promise<void> {
    const service = createServiceClient();
    if (!service) throw new Error("Gateway settlement storage is unavailable.");
    const { error } = await service.from("gateway_usage_events").insert({
      project_id: input.projectId,
      user_id: input.actorId,
      trace_id: input.traceId,
      event_type: "gateway.limit.settlement",
      estimated_cost_usd: settlement.actualMicros / 1_000_000,
      metadata: {
        reservation_id: settlement.reservationId,
        reserved_micros: settlement.reservedMicros,
        actual_micros: settlement.actualMicros,
        refunded_micros: settlement.refundedMicros,
        outcome: settlement.outcome,
      },
    });
    if (error) throw new Error(error.message);
  }
}

