/** Studio V5 M2 — price-state resolution (Lock L). Pure, browser-safe. */
import type { PriceState } from "./types";

/** Minimal price-row view: the sync script persists the full candidate row. */
export interface PriceRowView {
  status: "VERIFIED" | "DERIVED" | "UNKNOWN";
  /** `pricing.raw_hash` the row was derived from. */
  evidenceHash: string | null;
}

export interface PriceQuoteGuidance {
  /** A real ICU quote may be produced. */
  canQuote: boolean;
  /** An indicative estimate may be shown (labelled, never quoted). */
  canEstimate: boolean;
  /** Exact UI copy for the non-quoting states. */
  label: string | null;
  /** Admission code when admission must be refused. */
  blockedCode: "BLOCKED_PRICE_UNKNOWN" | null;
}

/**
 * Resolve exactly one price state. VERIFIED and DERIVED survive only while
 * the source hash still matches the derivation evidence; a changed source
 * demotes them to STALE. Absent or ambiguous parses are UNKNOWN.
 */
export function resolvePriceState(
  row: PriceRowView | null,
  currentSourceHash: string | null,
): PriceState {
  if (!row || row.status === "UNKNOWN") return "UNKNOWN";
  if (row.evidenceHash && currentSourceHash && row.evidenceHash !== currentSourceHash) return "STALE";
  return row.status;
}

/** Quote contract: VERIFIED quotes; DERIVED estimates labelled; else PRICE_UNKNOWN. */
export function priceQuoteGuidance(state: PriceState): PriceQuoteGuidance {
  switch (state) {
    case "VERIFIED":
      return { canQuote: true, canEstimate: true, label: null, blockedCode: null };
    case "DERIVED":
      return { canQuote: false, canEstimate: true, label: "unverified price", blockedCode: "BLOCKED_PRICE_UNKNOWN" };
    case "STALE":
    case "UNKNOWN":
      return { canQuote: false, canEstimate: false, label: "Price not verified", blockedCode: "BLOCKED_PRICE_UNKNOWN" };
  }
}
