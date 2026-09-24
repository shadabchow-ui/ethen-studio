// ── Ethen Gateway — GW-R6 — Smart Routing types ─────────────────────────
// Type definitions for the intelligent model execution layer.
// These types extend the existing gateway/provider layer without replacing it.

import type { GatewayProviderId } from "../types";
import type { CostTier } from "@ethen/ai/cortex/types";

// ── Smart aliases ───────────────────────────────────────────────────────

/**
 * Smart model aliases shipped by the Gateway. Each alias has a fully
 * specified weight profile (see aliases.ts) and — where the alias name
 * implies a non-negotiable capability — hard requirement gates.
 */
export type SmartAliasId =
  | "ethen/auto"
  | "ethen/fast"
  | "ethen/best"
  | "ethen/cheap"
  | "ethen/reasoning"
  | "ethen/coding"
  | "ethen/vision"
  | "ethen/long-context";

export const SMART_ALIAS_IDS: readonly SmartAliasId[] = [
  "ethen/auto",
  "ethen/fast",
  "ethen/best",
  "ethen/cheap",
  "ethen/reasoning",
  "ethen/coding",
  "ethen/vision",
  "ethen/long-context",
] as const;

export function isSmartAlias(model: string | null | undefined): model is SmartAliasId {
  if (!model || typeof model !== "string") return false;
  return (SMART_ALIAS_IDS as readonly string[]).includes(model.trim());
}

// ── Request requirements ────────────────────────────────────────────────

export type RequestModality = "text" | "image" | "unknown";

export type LatencyTarget = "fast" | "balanced" | "patient" | "unknown";

export type CertificationLevel = "any" | "live";

/** Minimum context window for ethen/long-context (128K). */
export const LONG_CONTEXT_MIN_TOKENS = 128_000;

/** Minimum context window for ethen/coding candidates. */
export const CODING_CONTEXT_MIN_TOKENS = 64_000;

/**
 * Hard requirements extracted from a request. Every field that is set must
 * be satisfied by a candidate BEFORE the candidate enters the scoring pool.
 */
export interface SmartRoutingRequirements {
  modality: RequestModality;
  /** True when any message carries an image part. */
  requiresVision: boolean;
  /** True when the request declares a tools array. */
  requiresTools: boolean;
  /** True when the request declares response_format (structured output). */
  requiresStructuredOutput: boolean;
  /** Estimated input tokens (messages only). */
  estimatedInputTokens: number;
  /** Requested max output tokens, when set. */
  maxOutputTokens?: number;
  /** Latency preference derived from the request when present. */
  latencyTarget: LatencyTarget;
  /**
   * Per-request budget ceiling in USD. When set, candidates whose estimated
   * request cost exceeds the ceiling are excluded before scoring.
   */
  budgetCeilingUsd?: number;
  /** Request-level provider allow-list (providerOptions.gateway.only). */
  providerRestrictions?: GatewayProviderId[];
  /**
   * Certification floor. "live" requires a current dated live certification
   * receipt for the provider; "any" accepts any implemented adapter.
   */
  certificationLevel: CertificationLevel;
  /** True when requirements came from the request rather than defaults. */
  source: "request" | "defaults";
}

// ── Candidates ──────────────────────────────────────────────────────────

export type CandidateHealth = "healthy" | "degraded" | "unavailable";

export interface SmartRoutingCandidate {
  /** Gateway provider id (mock|openai|anthropic|deepseek|openai-compatible). */
  providerId: GatewayProviderId;
  /** Concrete model id the provider will be asked for. */
  modelId: string;
  visibleName: string;
  /** 0..1 quality score. Source recorded in qualitySource. */
  qualityScore: number;
  qualitySource: "model-intelligence" | "quality-tier" | "default";
  /** Exact per-token price from the pricing registry, when sourced. */
  costPerInputTokenUsd?: number;
  costPerOutputTokenUsd?: number;
  priceSource: "pricing-registry" | "catalog" | "tier";
  /** Coarse cost tier used when exact per-token pricing is not available. */
  costTier?: CostTier;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStructuredOutput: boolean;
  supportsStreaming: boolean;
  /** Reasoning capability metadata (MI technical specs / catalog family). */
  supportsReasoning?: boolean;
  latencyClass: "fast" | "balanced" | "slow" | "unknown";
  /** Measured TTFT in seconds from Model Intelligence, when available. */
  ttftSeconds?: number;
  /** Live reliability from Gateway telemetry, when samples exist. */
  reliabilityScore?: number;
  health: CandidateHealth;
  /** True when the provider has a current dated live certification receipt. */
  certified: boolean;
  /** Human-readable provenance for the candidate entry. */
  source: string;
}

export interface RejectedCandidate {
  candidate: SmartRoutingCandidate;
  reason: string;
}

// ── Telemetry ───────────────────────────────────────────────────────────

export type GatewayOutcomeErrorClass =
  | "timeout"
  | "rate_limited"
  | "stream_interrupted"
  | "provider_error"
  | "auth_error"
  | "client_abort"
  | "other";

export interface GatewayOutcomeEvent {
  providerId: string;
  modelId: string;
  requestId: string;
  succeeded: boolean;
  latencyMs?: number;
  ttftMs?: number;
  errorClass?: GatewayOutcomeErrorClass;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  fallbackUsed?: boolean;
  streamCompleted?: boolean;
  timestamp?: number;
}

export interface TelemetryKey {
  providerId: string;
  modelId: string;
}

export interface TelemetryStats {
  providerId: string;
  modelId: string;
  samples: number;
  successRate: number;
  /** Approximate p50 latency (ms) — mean when fewer than 5 samples. */
  p50LatencyMs: number;
  /** Approximate p95 latency (ms) — mean when fewer than 5 samples. */
  p95LatencyMs: number;
  avgTtftMs: number;
  timeoutRate: number;
  rateLimitRate: number;
  streamInterruptionRate: number;
  avgCostUsd: number;
  fallbackRate: number;
  /** MI-P0-05: wall-clock time of the most recent telemetry sample (null when none). */
  observedAt: string | null;
}

// ── Canary ──────────────────────────────────────────────────────────────

export interface CanaryTarget {
  aliasId: SmartAliasId;
  providerId: string;
  modelId: string;
  /** Rollout percent 0..100. 0 = disabled, 100 = full. */
  rolloutPercent: number;
  /** Minimum success rate required before promotion is warranted. */
  minSuccessRate: number;
  /** Minimum number of telemetry samples before acceptance is measured. */
  minSamples: number;
}

export interface CanaryGateResult {
  target: CanaryTarget;
  bucketHit: boolean;
  bucket: number;
  /** Measured acceptance criteria from live telemetry (may be null pre-warm). */
  acceptance: {
    measurable: boolean;
    successRate: number | null;
    samples: number;
    meetsCriteria: boolean | null;
  };
  /** True when the canary candidate was promoted to rank 1 for this request. */
  promoted: boolean;
}

// ── Scoring ─────────────────────────────────────────────────────────────

export interface ScoreComponents {
  quality: number;
  latency: number;
  ttft: number;
  cost: number;
  reliability: number;
  health: number;
  context: number;
  tools: number;
}

export interface ScoredCandidate {
  candidate: SmartRoutingCandidate;
  score: number;
  components: ScoreComponents;
}

// ── Decision & receipt ──────────────────────────────────────────────────

export interface SmartRoutingDecision {
  aliasId: SmartAliasId;
  policyVersion: string;
  /** Selected candidate, or null when the capability filter left no pool. */
  selected: SmartRoutingCandidate | null;
  /** Ranked capability-safe pool (selected first). Used as fallback order. */
  ranked: SmartRoutingCandidate[];
  rejected: RejectedCandidate[];
  score: number;
  reasonCodes: string[];
  /** Sanitized score components for the winning candidate. */
  scoreComponents: ScoreComponents;
  telemetryIncluded: boolean;
  canary: CanaryGateResult | null;
  createdAt: string;
}

/**
 * Public routing receipt emitted on responses (inside `ethen.routing`).
 * Deliberately limited to routing facts — never internal scores, secrets,
 * or tenant data beyond the model/provider selection.
 */
export interface SmartRoutingReceipt {
  requested_model: string;
  selected_model: string;
  selected_provider: string;
  reason_codes: string[];
  routing_policy_version: string;
  candidate_count: number;
  rejected_count: number;
  score_components?: ScoreComponents;
  canary?: {
    target_model: string;
    target_provider: string;
    rollout_percent: number;
    bucket_hit: boolean;
    promoted: boolean;
    acceptance_met: boolean | null;
  } | null;
}
