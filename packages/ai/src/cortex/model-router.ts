import { ADAPTER_CAPABILITIES } from "@ethen/models/capabilities";
import type { GatewayProviderId } from "@ethen/models/gateway/types";
import type {
  CostTier,
  ModelCandidate,
  QualityTier,
  RouteReasonCode,
} from "./types";

export interface RouterWeights {
  quality: number;
  cost: number;
  latency: number;
  reliability: number;
  context: number;
  tools: number;
}

export interface RouterOptions {
  requiredCapabilities?: {
    tools?: boolean;
    longContext?: boolean;
    jsonMode?: boolean;
    vision?: boolean;
    sourceGrounding?: boolean;
    repoContext?: boolean;
  };
  healthOverride?: Record<string, "healthy" | "unavailable">;
  estimatedContextTokens?: number;
}

export interface RejectedCandidate {
  candidate: ModelCandidate;
  reason: RouteReasonCode;
}

export interface RouterResult {
  selected: ModelCandidate | null;
  fallbacks: ModelCandidate[];
  rejected: RejectedCandidate[];
  selectedRank: number;
  score: number;
  reasonCodes: RouteReasonCode[];
  warnings: string[];
}

export const ROUTER_WEIGHTS: Record<string, RouterWeights> = {
  "cortex-lite": { quality: 1, cost: 4, latency: 4, reliability: 3, context: 1, tools: 1 },
  "cortex":       { quality: 3, cost: 3, latency: 3, reliability: 3, context: 2, tools: 2 },
  "cortex-pro":   { quality: 5, cost: 1, latency: 2, reliability: 4, context: 2, tools: 2 },
  "code":         { quality: 4, cost: 2, latency: 2, reliability: 4, context: 5, tools: 5 },
  "research":     { quality: 4, cost: 2, latency: 2, reliability: 4, context: 5, tools: 5 },
  "writer":       { quality: 4, cost: 3, latency: 3, reliability: 3, context: 1, tools: 2 },
  "operator":     { quality: 4, cost: 2, latency: 2, reliability: 5, context: 5, tools: 5 },
};

function normalizeTier(tier: QualityTier): number {
  switch (tier) {
    case "max": return 1;
    case "premium": return 0.8;
    case "balanced": return 0.6;
    case "starter": return 0.2;
  }
}

function normalizeLatency(latencyClass: string): number {
  switch (latencyClass) {
    case "fast": return 1;
    case "balanced": return 0.6;
    case "slow": return 0.3;
    default: return 0.5;
  }
}

function hasExactCost(c: ModelCandidate): boolean {
  return c.costPerInputTokenUsd != null && c.costPerOutputTokenUsd != null;
}

// Tier-based score for candidates with no exact per-token cost configured.
// Deliberately mid-range and never 1 (cheapest) or 0 (most expensive) —
// missing exact cost data must not behave as free or as the lowest-cost
// candidate in router scoring.
function tierCostScore(tier?: CostTier): number {
  switch (tier) {
    case "low": return 0.65;
    case "medium": return 0.5;
    case "high": return 0.35;
    case "variable": return 0.4;
    default: return 0.4;
  }
}

function computeCostScore(
  candidate: ModelCandidate,
  allCandidates: ModelCandidate[]
): number {
  if (!hasExactCost(candidate)) {
    return tierCostScore(candidate.costTier);
  }

  const exactCostCandidates = allCandidates.filter(hasExactCost);
  const costs = exactCostCandidates.map(
    (c) => (c.costPerInputTokenUsd ?? 0) + (c.costPerOutputTokenUsd ?? 0)
  );
  const min = Math.min(...costs);
  const max = Math.max(...costs);
  const cCost =
    (candidate.costPerInputTokenUsd ?? 0) +
    (candidate.costPerOutputTokenUsd ?? 0);
  if (max <= min) return 0.5;
  return 1 - (cCost - min) / (max - min);
}

function scoreCandidate(
  candidate: ModelCandidate,
  weights: RouterWeights,
  allCandidates: ModelCandidate[],
  estimatedContextTokens?: number
): number {
  const qualityScore = candidate.qualityScore ?? normalizeTier(candidate.qualityTier);
  const costScore = computeCostScore(candidate, allCandidates);
  const latencyScore = normalizeLatency(candidate.latencyClass);
  const reliabilityScore = candidate.reliabilityScore ?? 0.5;

  let contextScore = 0.5;
  if (
    estimatedContextTokens !== undefined &&
    candidate.contextWindowTokens !== undefined &&
    candidate.contextWindowTokens > 0
  ) {
    contextScore = Math.min(1, candidate.contextWindowTokens / estimatedContextTokens);
  }

  const toolScore = candidate.supportsTools ? 1 : 0;

  const total =
    weights.quality * qualityScore +
    weights.cost * costScore +
    weights.latency * latencyScore +
    weights.reliability * reliabilityScore +
    weights.context * contextScore +
    weights.tools * toolScore;

  const totalWeight =
    weights.quality +
    weights.cost +
    weights.latency +
    weights.reliability +
    weights.context +
    weights.tools;

  return totalWeight > 0 ? total / totalWeight : 0;
}

function dominantDimension(weights: RouterWeights): string {
  const entries: [string, number][] = [
    ["quality", weights.quality],
    ["cost", weights.cost],
    ["latency", weights.latency],
    ["reliability", weights.reliability],
    ["context", weights.context],
    ["tools", weights.tools],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

export function selectCandidates(
  routeId: string,
  candidates: ModelCandidate[],
  options?: RouterOptions
): RouterResult {
  const weights = ROUTER_WEIGHTS[routeId];
  if (!weights) {
    return {
      selected: null,
      fallbacks: [],
      rejected: candidates.map((c) => ({
        candidate: c,
        reason: "provider_unavailable" as RouteReasonCode,
      })),
      selectedRank: 0,
      score: 0,
      reasonCodes: [],
      warnings: [`Unknown route profile: ${routeId}`],
    };
  }

  const rejected: RejectedCandidate[] = [];
  const pass: ModelCandidate[] = [];
  const warnings: string[] = [];

  for (const c of candidates) {
    if (!c.enabled) {
      rejected.push({ candidate: c, reason: "provider_unavailable" });
      continue;
    }

    if (options?.healthOverride?.[c.providerId] === "unavailable") {
      rejected.push({ candidate: c, reason: "provider_unavailable" });
      continue;
    }

    const executable = ADAPTER_CAPABILITIES[c.providerId as GatewayProviderId];
    if (options?.requiredCapabilities?.tools && (!c.supportsTools || !executable?.tools)) {
      rejected.push({ candidate: c, reason: "requires_tool_support" });
      continue;
    }

    if (options?.requiredCapabilities?.jsonMode && (!c.supportsJsonMode || !executable?.json)) {
      rejected.push({ candidate: c, reason: "requires_json_mode" });
      continue;
    }

    if (options?.requiredCapabilities?.vision && (!c.supportsVision || !executable?.vision)) {
      rejected.push({
        candidate: c,
        reason: "provider_unavailable",
      });
      warnings.push(
        `Candidate ${c.id} rejected: vision required but not supported`
      );
      continue;
    }

    if (
      options?.requiredCapabilities?.longContext &&
      options?.estimatedContextTokens !== undefined &&
      c.contextWindowTokens !== undefined &&
      c.contextWindowTokens < options.estimatedContextTokens
    ) {
      rejected.push({ candidate: c, reason: "requires_long_context" });
      continue;
    }

    pass.push(c);
  }

  if (pass.length === 0) {
    return {
      selected: null,
      fallbacks: [],
      rejected,
      selectedRank: 0,
      score: 0,
      reasonCodes: [],
      warnings,
    };
  }

  const scored = pass.map((c) => ({
    candidate: c,
    score: scoreCandidate(c, weights, candidates, options?.estimatedContextTokens),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.candidate.id.localeCompare(b.candidate.id);
  });

  const selected = scored[0].candidate;
  const fallbacks = scored.slice(1).map((s) => s.candidate);

  const reasonCodes: RouteReasonCode[] = [];
  const dim = dominantDimension(weights);
  switch (dim) {
    case "quality":
      reasonCodes.push("highest_quality_candidate");
      break;
    case "cost":
      reasonCodes.push("lowest_cost_candidate");
      break;
    case "latency":
      reasonCodes.push("lowest_latency_candidate");
      break;
    default:
      reasonCodes.push("selected_by_intent");
      break;
  }

  if (options?.requiredCapabilities?.tools) {
    if (!reasonCodes.includes("requires_tool_support")) {
      reasonCodes.push("requires_tool_support");
    }
  }
  if (options?.requiredCapabilities?.longContext) {
    if (!reasonCodes.includes("requires_long_context")) {
      reasonCodes.push("requires_long_context");
    }
  }

  return {
    selected,
    fallbacks,
    rejected,
    selectedRank: 1,
    score: scored[0].score,
    reasonCodes,
    warnings,
  };
}

export function getRouterWeightsForRoute(routeId: string): RouterWeights | null {
  return ROUTER_WEIGHTS[routeId] ?? null;
}
