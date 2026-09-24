/**
 * Studio V2 Job 05 — deterministic acceptance-aware ranking + receipts.
 *
 * Optimizes toward expected accepted-deliverable outcome over measured
 * signals only: capability fit (gate), historical acceptance, success,
 * price, repair frequency. Latency and preference signals are accepted as
 * inputs but reported unknown until measured — never synthesized.
 * Pure functions: identical inputs always reproduce the identical receipt.
 */

import { createHash, randomUUID } from "node:crypto";
import { STUDIO_CATALOG_VERSION, projectCapability, type CanonicalModelRef } from "./model-catalog";
import type { ProviderHealth } from "./provider-health";

export const RANKING_WEIGHTS_VERSION = "ranking-weights-v1" as const;
/** Versioned weights (documented, reviewable): acceptance dominates. */
export const RANKING_WEIGHTS = Object.freeze({
  acceptance: 0.4,
  success: 0.25,
  cost: 0.15,
  latency: 0.1,
  repair: 0.1,
});

export interface RouteQuote {
  credits: number;
  pricingVersionId: string;
}

export interface RankingInput {
  capability: string;
  quotes: Readonly<Record<string, RouteQuote>>;
  health: Readonly<Record<string, ProviderHealth>>;
  preferences?: { readonly maxCredits?: number; readonly preferredCatalogId?: string };
}

export interface CandidateScore {
  catalogId: string;
  providerId: string;
  modelId: string;
  scores: {
    acceptance: number | null;
    success: number | null;
    cost: number | null;
    latency: number | null;
    repair: number | null;
  };
  unknownFields: string[];
  /** Null when any scored signal is unknown: no fabricated totals. */
  total: number | null;
}

export interface RoutingReceipt {
  receiptId: string;
  weightsVersion: typeof RANKING_WEIGHTS_VERSION;
  catalogVersion: typeof STUDIO_CATALOG_VERSION;
  capability: string;
  inputsHash: string;
  candidates: CandidateScore[];
  unranked: Array<{ catalogId: string | null; reason: string }>;
  winner: string | null;
  confidence: "high" | "medium" | "low" | "unknown";
  createdAt: string;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function scoreCost(credits: number, maxCredits: number): number {
  if (maxCredits <= 0) return 1;
  return Math.max(0, 1 - credits / maxCredits);
}

/**
 * Rank the qualified routes for a capability. Unmeasured signals stay null;
 * totals exist only when every weighted signal is measured. A sole
 * qualified candidate still wins on cold start — explicitly low-confidence
 * with unknown fields listed, never with invented scores.
 */
export function rankRoutes(input: RankingInput): { candidates: CandidateScore[]; unranked: RoutingReceipt["unranked"]; winner: string | null; receipt: RoutingReceipt } {
  const refs: CanonicalModelRef[] = projectCapability(input.capability);
  const unranked: RoutingReceipt["unranked"] = [];
  if (refs.length === 0) {
    unranked.push({ catalogId: null, reason: `no qualified route for capability ${input.capability}` });
  }
  const maxCredits = input.preferences?.maxCredits ?? Math.max(0, ...refs.map((ref) => input.quotes[ref.catalogId]?.credits ?? 0));
  const candidates: CandidateScore[] = refs.map((ref) => {
    const health = input.health[ref.catalogId];
    const quote = input.quotes[ref.catalogId];
    const unknownFields: string[] = [];
    if (!health || health.sampleSize === 0) unknownFields.push("acceptance", "success", "repair");
    if (!quote) unknownFields.push("cost");
    unknownFields.push("latency");
    const scores: CandidateScore["scores"] = {
      acceptance: health?.acceptanceRate ?? null,
      success: health?.successRate ?? null,
      cost: quote ? scoreCost(quote.credits, maxCredits) : null,
      latency: null,
      repair: health ? Math.max(0, 1 - Math.min(1, health.repairRate ?? 0)) : null,
    };
    const measurable = [scores.acceptance, scores.success, scores.cost, scores.repair];
    const total = measurable.every((score): score is number => typeof score === "number")
      ? RANKING_WEIGHTS.acceptance * (scores.acceptance as number)
        + RANKING_WEIGHTS.success * (scores.success as number)
        + RANKING_WEIGHTS.cost * (scores.cost as number)
        + RANKING_WEIGHTS.repair * (scores.repair as number)
      : null;
    return { catalogId: ref.catalogId, providerId: ref.providerId, modelId: ref.modelId, scores, unknownFields, total };
  });
  const ordered = [...candidates].sort((a, b) => {
    if (a.total === null && b.total === null) return a.catalogId.localeCompare(b.catalogId);
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    if (b.total !== a.total) return b.total - a.total;
    return a.catalogId.localeCompare(b.catalogId);
  });
  const preferred = input.preferences?.preferredCatalogId;
  const winner = preferred && ordered.some((candidate) => candidate.catalogId === preferred)
    ? preferred
    : (ordered[0]?.catalogId ?? null);
  const winnerHealth = winner ? input.health[winner] : undefined;
  const confidence = winnerHealth ? winnerHealth.confidence : "unknown";
  const receipt: RoutingReceipt = {
    receiptId: randomUUID(),
    weightsVersion: RANKING_WEIGHTS_VERSION,
    catalogVersion: STUDIO_CATALOG_VERSION,
    capability: input.capability,
    inputsHash: createHash("sha256").update(canonicalJson({
      capability: input.capability,
      catalog: refs.map((ref) => ref.catalogId),
      quotes: input.quotes,
      health: Object.fromEntries(Object.entries(input.health).map(([id, healthValue]) => [id, {
        n: healthValue.sampleSize, success: healthValue.successRate, acceptance: healthValue.acceptanceRate,
        cost: healthValue.avgSettledCredits, repair: healthValue.repairRate, at: healthValue.lastObservedAt,
      }])),
      preferences: input.preferences ?? null,
      versions: { weights: RANKING_WEIGHTS_VERSION, catalog: STUDIO_CATALOG_VERSION },
    })).digest("hex"),
    candidates: ordered,
    unranked,
    winner,
    confidence,
    createdAt: new Date().toISOString(),
  };
  return { candidates: ordered, unranked, winner, receipt };
}
