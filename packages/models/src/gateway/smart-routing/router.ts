// ── Ethen Gateway — GW-R6 — Smart routing orchestration ─────────────────
// The routing pipeline:
//   request → requirements → effective policy → candidate pool →
//   capability filter → live telemetry → budget/cost filter →
//   provider health → ranked candidates → canary gate → decision.
//
// Fail-closed: when the capability filter leaves no pool, the decision has
// `selected: null` and the caller must not execute a provider call.

import "server-only";

import { getSmartAlias, mergeAliasGates, ROUTING_POLICY_VERSION } from "./aliases";
import { filterCandidates, type CapabilityFilterContext } from "./capability-filter";
import { scoreCandidates } from "./scorer";
import { buildSmartRoutingReceipt } from "./receipts";
import { applyCanaryGate } from "./canary";
import { getTelemetrySnapshot } from "./telemetry";
import { buildSmartCandidates } from "./model-intelligence";
import { isProviderCircuitOpen } from "@ethen/ai/cortex/circuit-breaker";
import { filterAllowedProviders } from "../platform/provider-allowlist";
import { getDecryptedProviderKeyForProvider } from "../platform/provider-credentials";
import { getGatewayProviderHealthSummary } from "@ethen/security/provider-health";
import { getProviderApiKey } from "../env";
import type { GatewayProviderId } from "../types";
import type {
  RejectedCandidate,
  ScoreComponents,
  SmartAliasId,
  SmartRoutingCandidate,
  SmartRoutingDecision,
  SmartRoutingReceipt,
  SmartRoutingRequirements,
} from "./types";

export interface ResolveSmartRouteInput {
  aliasId: SmartAliasId;
  requirements: SmartRoutingRequirements;
  /** Gateway route profile id (text-general, text-quality, ...). */
  routeId: string;
  requestId: string;
  projectId?: string | null;
  /** Request-level provider allow-list (providerOptions.gateway.only). */
  onlyProviders?: GatewayProviderId[];
  /**
   * Effective project budget ceiling in USD (remaining budget for this
   * window). When set, candidates whose estimated request cost exceeds it
   * are excluded by the budget filter.
   */
  budgetCeilingUsd?: number;
  /**
   * Injectable project-allowlist checker. Defaults to the real gateway
   * allowlist (fail-closed without Supabase); tests inject a stub.
   */
  isProviderAllowed?: (providerId: string) => Promise<boolean> | boolean;
}

export interface ResolveSmartRouteResult {
  decision: SmartRoutingDecision;
  receipt: SmartRoutingReceipt;
}

const PRODUCTION_PROVIDERS: readonly GatewayProviderId[] = [
  "openai",
  "anthropic",
  "deepseek",
  "openai-compatible",
];

function buildTelemetryMap(): Map<string, import("./types").TelemetryStats> {
  const map = new Map<string, import("./types").TelemetryStats>();
  for (const stats of getTelemetrySnapshot()) {
    map.set(`${stats.providerId}:${stats.modelId}`, stats);
  }
  return map;
}

async function resolveProviderHealth(
  candidates: SmartRoutingCandidate[],
  projectId: string | null | undefined,
): Promise<SmartRoutingCandidate[]> {
  const healthSummary = getGatewayProviderHealthSummary();
  const healthByProvider = new Map(
    healthSummary.providers.map((p) => [p.id, p]),
  );

  const refreshed: SmartRoutingCandidate[] = [];
  for (const candidate of candidates) {
    const health = healthByProvider.get(candidate.providerId);

    let availableByKey = candidate.health === "healthy";
    if (!availableByKey) {
      // BYOK: a project-scoped stored key makes a provider available even
      // without a server-level env key. Best-effort lookup.
      if (projectId && candidate.providerId !== "openai-compatible") {
        try {
          const byokKey = await getDecryptedProviderKeyForProvider(candidate.providerId, projectId);
          availableByKey = Boolean(byokKey);
        } catch {
          availableByKey = false;
        }
      }
    }

    const adapterImplemented = health?.adapterImplemented ?? false;
    const circuitOpen = isProviderCircuitOpen(candidate.providerId);

    const effectiveHealth: SmartRoutingCandidate["health"] =
      circuitOpen || !availableByKey
        ? "unavailable"
        : !adapterImplemented
          ? "degraded"
          : "healthy";

    refreshed.push({ ...candidate, health: effectiveHealth });
  }

  return refreshed;
}

/**
 * Resolve a smart alias to a concrete (provider, model) decision.
 * Deterministic for a fixed input + telemetry state.
 */
export async function resolveSmartRoute(
  input: ResolveSmartRouteInput,
): Promise<ResolveSmartRouteResult> {
  const alias = getSmartAlias(input.aliasId);
  if (!alias) {
    throw new Error(`Unknown smart alias: ${input.aliasId}`);
  }

  const requirements = mergeAliasGates(alias, input.requirements);

  // ── Candidate pool (Model Intelligence + pricing + catalog) ──────────
  const pool = await buildSmartCandidates(input.routeId);

  // ── Provider health + BYOK + circuit breaker ─────────────────────────
  const healthyPool = await resolveProviderHealth(pool, input.projectId);

  // ── Capability-safe filtering (hard requirements, budget, health) ────
  const filterContext: CapabilityFilterContext = {
    onlyProviders: input.onlyProviders,
    isProviderAllowed:
      input.isProviderAllowed ??
      ((providerId: string) => input.projectId ? isProjectProviderAllowed(providerId, input.projectId) : true),
    isProviderUnavailable: (providerId: string) => isProviderCircuitOpen(providerId),
  };

  // Budget ceiling: the effective remaining budget for this request.
  const budgetRequirements: SmartRoutingRequirements =
    input.budgetCeilingUsd != null
      ? {
          ...requirements,
          budgetCeilingUsd:
            requirements.budgetCeilingUsd != null
              ? Math.min(requirements.budgetCeilingUsd, input.budgetCeilingUsd)
              : input.budgetCeilingUsd,
        }
      : requirements;

  const filterResult = await filterCandidates(healthyPool, budgetRequirements, filterContext);

  const rejected: RejectedCandidate[] = [...filterResult.rejected];
  let pass = filterResult.pass;

  // ── Live telemetry (reliability / latency adjustments) ───────────────
  const telemetryByKey = buildTelemetryMap();

  // Telemetry hard gate: a provider/model pair that has failed EVERY recent
  // sample (>= 3 samples, 0% success) is treated as unhealthy and excluded
  // from the pool — it must never win on price alone while it is failing.
  // Mirrors the circuit-breaker threshold (3 consecutive failures) but uses
  // live Gateway telemetry as the evidence.
  const FAILING_TELEMETRY_MIN_SAMPLES = 3;
  const failingTelemetryKeys = new Set<string>();
  for (const [key, stats] of telemetryByKey.entries()) {
    if (stats.samples >= FAILING_TELEMETRY_MIN_SAMPLES && stats.successRate === 0) {
      failingTelemetryKeys.add(key);
    }
  }
  if (failingTelemetryKeys.size > 0) {
    const surviving: SmartRoutingCandidate[] = [];
    for (const candidate of pass) {
      const key = `${candidate.providerId}:${candidate.modelId}`;
      if (failingTelemetryKeys.has(key)) {
        rejected.push({ candidate, reason: "provider_telemetry_failing" });
      } else {
        surviving.push(candidate);
      }
    }
    pass = surviving;
  }

  // Deprioritize unhealthy providers: a provider whose circuit is open is
  // already excluded above; a degraded provider stays in the pool but is
  // scored down by the health component.
  if (pass.length === 0) {
    return {
      decision: {
        aliasId: input.aliasId,
        policyVersion: ROUTING_POLICY_VERSION,
        selected: null,
        ranked: [],
        rejected,
        score: 0,
        reasonCodes: ["no_capability_compatible_candidate"],
        scoreComponents: { quality: 0, latency: 0, ttft: 0, cost: 0, reliability: 0, health: 0, context: 0, tools: 0 },
        telemetryIncluded: false,
        canary: null,
        createdAt: new Date().toISOString(),
      },
      receipt: {
        requested_model: input.aliasId,
        selected_model: "none",
        selected_provider: "none",
        reason_codes: ["no_capability_compatible_candidate"],
        routing_policy_version: ROUTING_POLICY_VERSION,
        candidate_count: 0,
        rejected_count: rejected.length,
      },
    };
  }

  // ── Explainable scoring ──────────────────────────────────────────────
  const { scored, telemetryIncluded } = scoreCandidates({
    candidates: pass,
    requirements: budgetRequirements,
    weights: alias.weights,
    telemetryByKey,
    preferReasoning: alias.preferReasoning,
  });

  const ranked = scored.map((s) => s.candidate);
  const selected = ranked[0] ?? null;
  const winner = scored[0] ?? null;

  const reasonCodes = buildReasonCodes({
    requirements: budgetRequirements,
    selected: selected ?? undefined,
    scored,
    telemetryIncluded,
  });

  // ── Canary gate ──────────────────────────────────────────────────────
  let decision: SmartRoutingDecision = {
    aliasId: input.aliasId,
    policyVersion: ROUTING_POLICY_VERSION,
    selected,
    ranked,
    rejected,
    score: winner?.score ?? 0,
    reasonCodes,
    scoreComponents: winner?.components ?? { quality: 0, latency: 0, ttft: 0, cost: 0, reliability: 0, health: 0, context: 0, tools: 0 },
    telemetryIncluded,
    canary: null,
    createdAt: new Date().toISOString(),
  };

  const canaryResult = applyCanaryGate(decision, input.requestId, telemetryByKey);
  decision = canaryResult.decision;
  decision.canary = canaryResult.canary;

  if (decision.selected && canaryResult.canary?.promoted && decision.ranked[0]) {
    decision.selected = decision.ranked[0];
  }

  return { decision, receipt: buildSmartRoutingReceipt(decision) };
}

function buildReasonCodes(input: {
  requirements: SmartRoutingRequirements;
  selected?: SmartRoutingCandidate;
  scored: Array<{ candidate: SmartRoutingCandidate; score: number; components: ScoreComponents }>;
  telemetryIncluded: boolean;
}): string[] {
  const codes: string[] = [];
  const { requirements, selected } = input;

  codes.push("supports_required_capabilities");

  if (requirements.requiresVision) codes.push("vision_capable");
  if (requirements.requiresTools) codes.push("tool_support");
  if (requirements.requiresStructuredOutput) codes.push("structured_output");
  if (requirements.budgetCeilingUsd != null) codes.push("within_budget");
  if (requirements.certificationLevel === "live") codes.push("live_certified");

  if (input.scored.length > 0 && selected) {
    const rank = input.scored.findIndex(
      (s) => s.candidate.providerId === selected.providerId && s.candidate.modelId === selected.modelId,
    );
    if (rank === 0) {
      const winner = input.scored[0];
      const maxComponent = (Object.entries(winner.components) as Array<[string, number]>).sort(
        (a, b) => b[1] - a[1],
      )[0]?.[0];
      switch (maxComponent) {
        case "cost": codes.push("preferred_cost_quality_balance"); break;
        case "latency":
        case "ttft": codes.push("lowest_latency_candidate"); break;
        case "quality": codes.push("highest_quality_candidate"); break;
        case "reliability": codes.push("high_recent_reliability"); break;
        default: codes.push("balanced_score");
      }
    }
  }

  if (input.telemetryIncluded) codes.push("telemetry_informed");
  return codes;
}

// ── Default project-allowlist checker (fail-closed like the gateway) ────

async function isProjectProviderAllowed(providerId: string, projectId: string): Promise<boolean> {
  const allowed = await filterAllowedProviders(PRODUCTION_PROVIDERS as unknown as string[], projectId);
  return allowed.includes(providerId);
}

/** Test utility — kept for API symmetry; the checker is stateless. */
export function resetSmartRouteAllowlistCache(): void {
  // No-op: the default checker queries the allowlist per request so policy
  // changes are honored immediately.
}
