// ── Ethen Gateway — GW-R6 — Capability-safe candidate filtering ────────
// A candidate must NEVER enter the scoring pool if it cannot satisfy the
// request. This module implements the hard-requirement filter.

import type { GatewayProviderId } from "../types";
import type {
  RejectedCandidate,
  SmartRoutingCandidate,
  SmartRoutingRequirements,
} from "./types";

export interface CapabilityFilterContext {
  /** Request-level provider allow-list (providerOptions.gateway.only). */
  onlyProviders?: GatewayProviderId[];
  /**
   * Optional callback for project allowlist enforcement. Defaults to
   * "allow" (the router resolves the real allowlist separately); injected
   * by the router so tests never hit Supabase.
   */
  isProviderAllowed?: (providerId: string) => boolean | Promise<boolean>;
  /**
   * Provider health signal (circuit breaker). When a provider's circuit is
   * open it is treated as unavailable and excluded.
   */
  isProviderUnavailable?: (providerId: string) => boolean;
}

export interface CapabilityFilterResult {
  pass: SmartRoutingCandidate[];
  rejected: RejectedCandidate[];
}

function canSatisfyContext(candidate: SmartRoutingCandidate, requirements: SmartRoutingRequirements): boolean {
  if (requirements.estimatedInputTokens <= 0) return true;
  if (candidate.contextWindowTokens == null) {
    // Unknown context window: allow only when the estimate is small enough
    // that every practical model would fit, otherwise fail closed.
    return requirements.estimatedInputTokens <= 32_000;
  }
  return candidate.contextWindowTokens >= requirements.estimatedInputTokens;
}

function canSatisfyMaxOutput(candidate: SmartRoutingCandidate, requirements: SmartRoutingRequirements): boolean {
  if (!requirements.maxOutputTokens) return true;
  if (candidate.maxOutputTokens == null) return true;
  return candidate.maxOutputTokens >= requirements.maxOutputTokens;
}

function estimatedRequestCost(candidate: SmartRoutingCandidate, requirements: SmartRoutingRequirements): number | null {
  if (candidate.costPerInputTokenUsd == null || candidate.costPerOutputTokenUsd == null) {
    return null;
  }
  const inputTokens = requirements.estimatedInputTokens || 1;
  const outputTokens = requirements.maxOutputTokens ?? 2048;
  return (
    inputTokens * candidate.costPerInputTokenUsd +
    outputTokens * candidate.costPerOutputTokenUsd
  );
}

/**
 * Filter a candidate pool against hard requirements + alias gates + policy.
 * Rejection reasons are explicit and explainable; rejected candidates never
 * reach the scorer.
 */
export async function filterCandidates(
  candidates: SmartRoutingCandidate[],
  requirements: SmartRoutingRequirements,
  context: CapabilityFilterContext = {},
): Promise<CapabilityFilterResult> {
  const pass: SmartRoutingCandidate[] = [];
  const rejected: RejectedCandidate[] = [];

  const onlyProviders = context.onlyProviders ?? [];
  const onlySet = new Set(onlyProviders);

  for (const candidate of candidates) {
    let reason: string | null = null;

    if (candidate.providerId === "mock") {
      reason = "mock_provider_excluded_from_smart_routing";
    } else if (onlySet.size > 0 && !onlySet.has(candidate.providerId)) {
      reason = "provider_restricted_by_request";
    } else if (context.isProviderAllowed && !(await context.isProviderAllowed(candidate.providerId))) {
      reason = "provider_blocked_by_project_policy";
    } else if (context.isProviderUnavailable?.(candidate.providerId)) {
      reason = "provider_circuit_open";
    } else if (candidate.health === "unavailable") {
      reason = "provider_unavailable";
    } else if (candidate.health === "degraded" && requirements.certificationLevel === "live") {
      reason = "provider_degraded_for_live_certification";
    } else if (requirements.certificationLevel === "live" && !candidate.certified) {
      reason = "requires_live_certification";
    } else if (requirements.requiresVision && !candidate.supportsVision) {
      reason = "requires_vision";
    } else if (requirements.requiresTools && !candidate.supportsTools) {
      reason = "requires_tool_support";
    } else if (requirements.requiresStructuredOutput && !candidate.supportsStructuredOutput) {
      reason = "requires_structured_output";
    } else if (!canSatisfyContext(candidate, requirements)) {
      reason = "insufficient_context_window";
    } else if (!canSatisfyMaxOutput(candidate, requirements)) {
      reason = "insufficient_max_output";
    } else if (!candidate.supportsStreaming) {
      reason = "streaming_unsupported";
    }

    if (reason !== null) {
      rejected.push({ candidate, reason });
      continue;
    }

    // Budget ceiling: exclude candidates whose estimated request cost
    // exceeds the request/project limit. Only applied when an exact price
    // is available; unknown-price candidates are NOT treated as free, they
    // simply cannot be excluded on cost grounds (cost scoring still
    // penalizes them via their cost tier).
    if (requirements.budgetCeilingUsd != null) {
      const estimated = estimatedRequestCost(candidate, requirements);
      if (estimated != null && estimated > requirements.budgetCeilingUsd) {
        rejected.push({
          candidate,
          reason: "estimated_cost_exceeds_budget_ceiling",
        });
        continue;
      }
    }

    pass.push(candidate);
  }

  return { pass, rejected };
}

export function estimatedRequestCostUsd(
  candidate: SmartRoutingCandidate,
  requirements: SmartRoutingRequirements,
): number | null {
  return estimatedRequestCost(candidate, requirements);
}
