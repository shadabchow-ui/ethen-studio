// ── Ethen Gateway — GW-R6 — Routing receipts ────────────────────────────
// Builds the public `ethen.routing` receipt attached to smart-routed
// responses. Deliberately excludes internal data (secrets, raw telemetry,
// tenant identifiers) — only routing facts are exposed.

import type {
  CanaryGateResult,
  ScoreComponents,
  SmartRoutingDecision,
  SmartRoutingReceipt,
} from "./types";

/**
 * Build the public routing receipt from a decision.
 * Rounds score components to 2 decimals so the receipt is stable and
 * readable; `score` is never exposed — only per-dimension components.
 */
export function buildSmartRoutingReceipt(decision: SmartRoutingDecision): SmartRoutingReceipt {
  const selected = decision.selected;

  return {
    requested_model: decision.aliasId,
    selected_model: selected?.modelId ?? "none",
    selected_provider: selected?.providerId ?? "none",
    reason_codes: [...decision.reasonCodes],
    routing_policy_version: decision.policyVersion,
    candidate_count: decision.ranked.length,
    rejected_count: decision.rejected.length,
    ...(selected
      ? { score_components: sanitizeScoreComponents(decision.scoreComponents) }
      : {}),
    ...(decision.canary ? { canary: sanitizeCanary(decision.canary) } : {}),
  };
}

function sanitizeScoreComponents(components: ScoreComponents): ScoreComponents {
  return {
    quality: round2(components.quality),
    latency: round2(components.latency),
    ttft: round2(components.ttft),
    cost: round2(components.cost),
    reliability: round2(components.reliability),
    health: round2(components.health),
    context: round2(components.context),
    tools: round2(components.tools),
  };
}

function sanitizeCanary(canary: CanaryGateResult): NonNullable<SmartRoutingReceipt["canary"]> {
  return {
    target_model: canary.target.modelId,
    target_provider: canary.target.providerId,
    rollout_percent: canary.target.rolloutPercent,
    bucket_hit: canary.bucketHit,
    promoted: canary.promoted,
    acceptance_met: canary.acceptance.meetsCriteria,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
