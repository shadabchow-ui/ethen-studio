/**
 * ETHEN-READY-039 — Stale price and benchmark exclusion policy.
 *
 * Defines when data is considered stale and should be excluded from
 * current comparisons while retaining historical provenance.
 *
 * Staleness is NOT deletion. Stale data remains in the dataset but
 * is flagged with `status: "stale"` or `isStale: true`.
 */

import type { MIModelPrice, MIPriceStatus, MIBenchmarkScore } from "./schemas";

// ─── Stale Price Policy ─────────────────────────────────────────────────────

export interface StalePricePolicy {
  /** Maximum age of a price in days before it's considered stale */
  maxPriceAgeDays: number;
  /** Prices older than this date are considered stale */
  staleBeforeDate: string;
  /** Prices recorded before this date with no effectiveAt are considered stale */
  defaultStaleDate: string;
}

/** Current stale price policy — tune these values as the dataset ages */
export const CURRENT_STALE_PRICE_POLICY: StalePricePolicy = {
  maxPriceAgeDays: 90,
  staleBeforeDate: "2026-04-28T00:00:00.000Z",
  defaultStaleDate: "2026-01-01T00:00:00.000Z",
};

/**
 * Evaluate whether a price is stale based on current policy.
 * Preserves the original price data regardless of staleness.
 *
 * MI-P0-04 (M4): staleness is computed relative to now() minus the max-age —
 * never against a hard-coded calendar date, which silently rots.
 */
export function evaluatePriceStatus(
  price: Pick<MIModelPrice, "effectiveAt" | "recordedAt">,
  policy: StalePricePolicy = CURRENT_STALE_PRICE_POLICY,
  now = Date.now(),
): MIPriceStatus {
  const effectiveDate = price.effectiveAt || price.recordedAt;
  if (!effectiveDate) return "unknown";

  try {
    const date = new Date(effectiveDate);
    if (isNaN(date.getTime())) return "unknown";
    const cutoff = now - policy.maxPriceAgeDays * 86_400_000;
    return date.getTime() >= cutoff ? "current" : "stale";
  } catch {
    return "unknown";
  }
}

/**
 * Filter to only current (non-stale) prices for comparison display.
 * Stale prices remain in the dataset for historical reference.
 */
export function getCurrentPrices(
  prices: MIModelPrice[],
  policy: StalePricePolicy = CURRENT_STALE_PRICE_POLICY,
): MIModelPrice[] {
  return prices.filter((p) => evaluatePriceStatus(p, policy) === "current");
}

// ─── Stale Benchmark Policy ────────────────────────────────────────────────

export interface StaleBenchmarkPolicy {
  /** Maximum age of a benchmark score in days before it's considered stale */
  maxBenchmarkAgeDays: number;
  /** Scores recorded before this date are considered stale */
  staleBeforeDate: string;
}

export const CURRENT_STALE_BENCHMARK_POLICY: StaleBenchmarkPolicy = {
  maxBenchmarkAgeDays: 180,
  staleBeforeDate: "2026-01-28T00:00:00.000Z",
};

/**
 * Evaluate whether a benchmark score is stale.
 * MI-P0-04 (M4): computed relative to now() minus the max-age, never against
 * a hard-coded calendar date.
 */
export function isBenchmarkStale(
  score: Pick<MIBenchmarkScore, "recordedAt">,
  policy: StaleBenchmarkPolicy = CURRENT_STALE_BENCHMARK_POLICY,
  now = Date.now(),
): boolean {
  if (!score.recordedAt) return true;
  try {
    const date = new Date(score.recordedAt);
    if (isNaN(date.getTime())) return true;
    const cutoff = now - policy.maxBenchmarkAgeDays * 86_400_000;
    return date.getTime() < cutoff;
  } catch {
    return true;
  }
}

/**
 * Filter to current (non-stale) benchmark scores for comparison.
 */
export function getCurrentBenchmarks(
  scores: MIBenchmarkScore[],
  policy: StaleBenchmarkPolicy = CURRENT_STALE_BENCHMARK_POLICY,
): MIBenchmarkScore[] {
  return scores.filter((s) => !isBenchmarkStale(s, policy));
}

// ─── Unknown Value Preservation ─────────────────────────────────────────────

/**
 * NEVER coerce null/unknown values to zero, false, or "unsupported".
 * Preserve the exact unknown state as recorded.
 */
export function preserveUnknown<T>(
  value: T | null | undefined,
): { known: true; value: T } | { known: false; value: null } {
  if (value === null || value === undefined) {
    return { known: false, value: null };
  }
  return { known: true, value };
}
