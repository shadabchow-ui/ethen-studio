/**
 * ETHEN-READY-039 — Canonical Model Intelligence schemas.
 *
 * Defines the canonical data shapes for models, providers, benchmarks,
 * categories, prices, capabilities, context windows, and provenance.
 *
 * All data-plane code uses these types. Generated data files must conform.
 */

import type { MIProvenance, MIEvidenceState } from "./provenance";

// ─── Provider ───────────────────────────────────────────────────────────────

export interface MIProvider {
  id: string;
  name: string;
  slug: string;
  website?: string;
  /** Canonical deep-link to the provider page on Ethen */
  canonicalUrl?: string;
  /** When this provider record was first added */
  addedAt: string;
  provenance: MIProvenance;
}

// ─── Model ──────────────────────────────────────────────────────────────────

export interface MIModelIdentity {
  id: string;
  slug: string;
  name: string;
  providerId: string;
  /** Aliases that resolve to this canonical slug. NEVER more than one canonical slug per model. */
  aliases: string[];
  /** Categories this model belongs to */
  categories: string[];
  /** When this model record was first added */
  addedAt: string;
  provenance: MIProvenance;
}

// ─── Pricing ────────────────────────────────────────────────────────────────

export type MIPriceTier = "input" | "output" | "cache_read" | "cache_write" | "training" | "fine_tuning";

export type MIPriceStatus = "current" | "stale" | "unknown";

export interface MIModelPrice {
  tier: MIPriceTier;
  /** Price per unit (e.g., per 1M tokens) in USD */
  priceUsd: number | null;
  /** Unit description */
  unit: string;
  /** Effective date of this price */
  effectiveAt: string;
  /** When this price was retrieved/recorded */
  recordedAt: string;
  /** Stale prices are excluded from current comparisons */
  status: MIPriceStatus;
  provenance: MIProvenance;
}

// ─── Benchmark ──────────────────────────────────────────────────────────────

export type MIBenchmarkCategory =
  | "reasoning" | "knowledge" | "coding" | "math"
  | "language" | "vision" | "audio" | "agentic"
  | "safety" | "instruction_following"
  | "general";

export interface MIBenchmarkScore {
  benchmarkId: string;
  benchmarkName: string;
  category: MIBenchmarkCategory;
  score: number | null;
  /** Display value — "Unknown" when score is null */
  displayValue: string;
  /** When this score was recorded */
  recordedAt: string;
  /** Stale scores are excluded from current comparisons */
  isStale: boolean;
  provenance: MIProvenance;
}

// ─── Context Window ─────────────────────────────────────────────────────────

export interface MIModelContext {
  /** Maximum context tokens */
  maxTokens: number | null;
  /** Maximum output tokens */
  maxOutputTokens: number | null;
  /** Whether the model supports structured output / JSON mode */
  supportsStructuredOutput: boolean | null;
  provenance: MIProvenance;
}

// ─── Capabilities ───────────────────────────────────────────────────────────

export interface MIModelCapabilities {
  /** Whether model supports streaming */
  streaming: boolean | null;
  /** Whether model supports function/tool calling */
  functionCalling: boolean | null;
  /** Whether model supports vision (image input) */
  vision: boolean | null;
  /** Whether model supports audio input */
  audio: boolean | null;
  /** Whether model supports code execution/interpreter */
  codeExecution: boolean | null;
  provenance: MIProvenance;
}

// ─── Full Model Profile ─────────────────────────────────────────────────────

export interface MIModelProfile {
  identity: MIModelIdentity;
  pricing: MIModelPrice[];
  benchmarks: MIBenchmarkScore[];
  context: MIModelContext;
  capabilities: MIModelCapabilities;
  /** Knowledge cutoff date */
  knowledgeCutoff: string | null;
  displayValue: string;
  provenance: MIProvenance;
  /** Integrity check: all fields should be known or explicitly unknown */
  integrity: {
    allFieldsKnownOrExplicitUnknown: boolean;
    unknownFields: string[];
  };
}

// ─── Data Index ─────────────────────────────────────────────────────────────

export interface MIIndexEntry {
  slug: string;
  name: string;
  providerId: string;
  providerName: string;
  profilePath: string;
  pagePath: string;
  categories: string[];
  /** Timestamp of the last deterministic regeneration */
  regeneratedAt: string;
  /** Commit SHA of the last regeneration */
  regeneratedFromCommit: string;
}

export interface MIIndex {
  profiles: MIIndexEntry[];
  regeneratedAt: string;
  regeneratedFromCommit: string;
  schemaVersion: string;
}
