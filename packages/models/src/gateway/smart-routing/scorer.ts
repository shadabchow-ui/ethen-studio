// ── Ethen Gateway — GW-R6 — Explainable scoring ─────────────────────────
// Explicit, versioned score components per candidate. The weights come from
// the alias's routing policy (aliases.ts); live telemetry and provider
// health feed the reliability/health components. Deterministic: ties are
// broken by (providerId, modelId) so a fixed input + state yields a fixed
// ranking.

import type { RoutingWeights } from "./aliases";
import type {
  ScoredCandidate,
  SmartRoutingCandidate,
  SmartRoutingRequirements,
  TelemetryStats,
} from "./types";
import { estimatedRequestCostUsd } from "./capability-filter";

// ── Normalization helpers ───────────────────────────────────────────────

function normalizeLatencyClass(latencyClass: SmartRoutingCandidate["latencyClass"]): number {
  switch (latencyClass) {
    case "fast": return 1;
    case "balanced": return 0.6;
    case "slow": return 0.3;
    default: return 0.5;
  }
}

/** TTFT seconds → 0..1 (lower is better). 1.26s → ~0.87. */
function normalizeTtft(ttftSeconds: number | undefined): number {
  if (ttftSeconds == null) return 0.5;
  return Math.min(1, Math.max(0, 1 - ttftSeconds / 10));
}

function normalizeCostTier(tier?: SmartRoutingCandidate["costTier"]): number {
  switch (tier) {
    case "low": return 0.65;
    case "medium": return 0.5;
    case "high": return 0.35;
    case "variable": return 0.4;
    default: return 0.4;
  }
}

/** 0..1 where 1 = cheapest. Uses exact prices when present, else cost tier. */
function computeCostScore(
  candidate: SmartRoutingCandidate,
  requirements: SmartRoutingRequirements,
  allExactCosts: number[],
): number {
  if (
    candidate.costPerInputTokenUsd != null &&
    candidate.costPerOutputTokenUsd != null
  ) {
    const estimate = estimatedRequestCostUsd(candidate, requirements);
    if (estimate != null && allExactCosts.length > 1) {
      const min = Math.min(...allExactCosts);
      const max = Math.max(...allExactCosts);
      if (max > min) return 1 - (estimate - min) / (max - min);
      return 0.5;
    }
    // Single exact-cost candidate: mid-range so it never wins on cost alone.
    return 0.5;
  }
  return normalizeCostTier(candidate.costTier);
}

function healthScore(health: SmartRoutingCandidate["health"]): number {
  switch (health) {
    case "healthy": return 1;
    case "degraded": return 0.4;
    case "unavailable": return 0;
  }
}

function contextFitScore(
  contextWindowTokens: number | undefined,
  estimatedInputTokens: number,
): number {
  if (contextWindowTokens == null || contextWindowTokens <= 0) return 0.5;
  if (estimatedInputTokens <= 0) return 1;
  return Math.min(1, contextWindowTokens / estimatedInputTokens);
}

function toolScore(supportsTools: boolean): number {
  return supportsTools ? 1 : 0;
}

function reasoningBonus(candidate: SmartRoutingCandidate, preferReasoning: boolean): number {
  if (!preferReasoning) return 0;
  if (candidate.supportsReasoning === true) return 0.05;
  if (candidate.supportsReasoning === false) return -0.05;
  return 0;
}

// ── Reliability from live telemetry ─────────────────────────────────────

export interface ReliabilitySignal {
  reliabilityScore: number;
  latencyPenalty: number;
  ttftPenalty: number;
  telemetryIncluded: boolean;
}

/**
 * Derive the reliability/latency/TTFT signals from live Gateway telemetry.
 * Cold candidates (no samples) get a neutral 0.5 reliability so they can
 * still be selected on other merit, and are flagged so receipts can say
 * telemetry was (not) included.
 */
export function deriveReliabilitySignal(
  candidate: SmartRoutingCandidate,
  telemetry: TelemetryStats | null,
): ReliabilitySignal {
  if (!telemetry || telemetry.samples === 0) {
    return { reliabilityScore: 0.5, latencyPenalty: 0, ttftPenalty: 0, telemetryIncluded: false };
  }

  const successRate = telemetry.successRate;
  // Penalize instability: 90%+ success → 1, 50% → ~0.55, 0% → 0.1.
  const reliabilityScore = Math.min(1, Math.max(0.1, 0.1 + successRate));

  // Latency penalty: p50 > 4s or p95 > 15s drags the latency component.
  const latencyPenalty = Math.min(1, (Math.max(0, telemetry.p50LatencyMs - 4000) / 20_000) +
    (Math.max(0, telemetry.p95LatencyMs - 15_000) / 30_000));

  const ttftPenalty = Math.min(1, Math.max(0, telemetry.avgTtftMs - 1500) / 10_000);

  return { reliabilityScore, latencyPenalty, ttftPenalty, telemetryIncluded: true };
}

// ── Scoring ─────────────────────────────────────────────────────────────

export interface ScoreCandidatesInput {
  candidates: SmartRoutingCandidate[];
  requirements: SmartRoutingRequirements;
  weights: RoutingWeights;
  /** Live telemetry snapshot, keyed by `${providerId}:${modelId}`. */
  telemetryByKey?: Map<string, TelemetryStats>;
  preferReasoning?: boolean;
}

export interface ScoreCandidatesResult {
  scored: ScoredCandidate[];
  telemetryIncluded: boolean;
}

export function scoreCandidates(input: ScoreCandidatesInput): ScoreCandidatesResult {
  const { candidates, requirements, weights } = input;
  const telemetryByKey = input.telemetryByKey ?? new Map<string, TelemetryStats>();

  const exactCosts = candidates
    .map((c) => estimatedRequestCostUsd(c, requirements))
    .filter((v): v is number => v != null);

  const scored: ScoredCandidate[] = candidates.map((candidate) => {
    const key = `${candidate.providerId}:${candidate.modelId}`;
    const telemetry = telemetryByKey.get(key) ?? null;
    const signal = deriveReliabilitySignal(candidate, telemetry);

    const quality = Math.min(1, Math.max(0, candidate.qualityScore + reasoningBonus(candidate, input.preferReasoning ?? false)));
    const latency = Math.max(0, Math.min(1, normalizeLatencyClass(candidate.latencyClass) - signal.latencyPenalty));
    const ttft = Math.max(0, Math.min(1, normalizeTtft(candidate.ttftSeconds) - signal.ttftPenalty));
    const cost = computeCostScore(candidate, requirements, exactCosts);
    const reliability = Math.max(0, Math.min(1, signal.reliabilityScore));
    const health = healthScore(candidate.health);
    const context = contextFitScore(candidate.contextWindowTokens, requirements.estimatedInputTokens);
    const tools = toolScore(candidate.supportsTools);

    const components = { quality, latency, ttft, cost, reliability, health, context, tools };

    const totalWeight =
      weights.quality + weights.latency + weights.ttft +
      weights.cost + weights.reliability + weights.health +
      weights.context + weights.tools;

    const rawScore =
      weights.quality * quality +
      weights.latency * latency +
      weights.ttft * ttft +
      weights.cost * cost +
      weights.reliability * reliability +
      weights.health * health +
      weights.context * context +
      weights.tools * tools;

    const score = totalWeight > 0 ? rawScore / totalWeight : 0;

    return { candidate, score: Number(score.toFixed(6)), components };
  });

  // Deterministic ranking: score desc, then (providerId, modelId) asc.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return `${a.candidate.providerId}:${a.candidate.modelId}`.localeCompare(
      `${b.candidate.providerId}:${b.candidate.modelId}`,
    );
  });

  const telemetryIncluded = scored.some((s) =>
    telemetryByKey.has(`${s.candidate.providerId}:${s.candidate.modelId}`),
  );

  return { scored, telemetryIncluded };
}
