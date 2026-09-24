import "server-only";

import {
  getPriceRecordState,
  type VersionedPriceRecord,
} from "../../pricing-registry";

export interface ModelPricing {
  inputPricePerToken: number | null;
  outputPricePerToken: number | null;
  inputPriceRaw: string | null;
  outputPriceRaw: string | null;
}

/**
 * Compatibility audit seam for the retired OCR catalog loader. It remains
 * readable but deliberately exposes zero billable records.
 */
export async function loadModelPricingCatalog(): Promise<Map<string, ModelPricing>> {
  return new Map();
}

export function resetModelPricingCache(): void {
  // The canonical versioned registry is immutable and has no mutable cache.
}

export type PricingState = "available" | "missing" | "stale" | "invalid";

export interface CostEstimate {
  inputCost: number | null;
  outputCost: number | null;
  totalCost: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  pricingAvailable: boolean;
  pricingState: PricingState;
  pricingMessage: string;
  priceRecordId: string | null;
  priceVersion: string | null;
  priceSource: string | null;
  priceRetrievedAt: string | null;
  priceExpiresAt: string | null;
  currency: string | null;
  unit: string | null;
}

function unavailableEstimate(
  inputTokens: number | null,
  outputTokens: number | null,
  state: Exclude<PricingState, "available">,
  message: string,
  record: VersionedPriceRecord | null = null,
): CostEstimate {
  return {
    inputCost: null,
    outputCost: null,
    totalCost: null,
    inputTokens,
    outputTokens,
    pricingAvailable: false,
    pricingState: state,
    pricingMessage: message,
    priceRecordId: record?.id ?? null,
    priceVersion: record?.version ?? null,
    priceSource: record?.source ?? null,
    priceRetrievedAt: record?.retrievedAt ?? null,
    priceExpiresAt: record?.expiresAt ?? null,
    currency: record?.currency ?? null,
    unit: record?.unit ?? null,
  };
}

export function estimateCostFromPriceRecord(
  record: VersionedPriceRecord,
  inputTokens: number | null,
  outputTokens: number | null,
  now = new Date(),
): CostEstimate {
  const retrievedAt = new Date(record.retrievedAt).getTime();
  const expiresAt = new Date(record.expiresAt).getTime();
  const maximumFreshnessMs = 30 * 24 * 60 * 60 * 1_000;
  if (
    record.sourceType !== "official_provider" ||
    !record.source ||
    !record.retrievedAt ||
    record.unit !== "per-token"
  ) {
    return unavailableEstimate(
      inputTokens,
      outputTokens,
      "invalid",
      `Price ${record.id} lacks official, dated per-token provenance.`,
      record,
    );
  }
  if (
    !Number.isFinite(retrievedAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= now.getTime() ||
    expiresAt <= retrievedAt ||
    expiresAt - retrievedAt > maximumFreshnessMs
  ) {
    return unavailableEstimate(
      inputTokens,
      outputTokens,
      "stale",
      `Price ${record.id} is outside the 30-day freshness window and is unusable for billing.`,
      record,
    );
  }

  const inputCost =
    inputTokens != null && inputTokens > 0 && record.inputPricePerUnit != null
      ? record.inputPricePerUnit * inputTokens
      : null;
  const outputCost =
    outputTokens != null && outputTokens > 0 && record.outputPricePerUnit != null
      ? record.outputPricePerUnit * outputTokens
      : null;

  return {
    inputCost,
    outputCost,
    totalCost:
      inputCost != null || outputCost != null
        ? (inputCost ?? 0) + (outputCost ?? 0)
        : null,
    inputTokens,
    outputTokens,
    pricingAvailable: true,
    pricingState: "available",
    pricingMessage: `Using current price ${record.id}.`,
    priceRecordId: record.id,
    priceVersion: record.version,
    priceSource: record.source,
    priceRetrievedAt: record.retrievedAt,
    priceExpiresAt: record.expiresAt,
    currency: record.currency,
    unit: record.unit,
  };
}

export async function estimateCostForModel(
  modelId: string,
  inputTokens: number | null,
  outputTokens: number | null,
  now = new Date(),
): Promise<CostEstimate> {
  const resolution = getPriceRecordState(modelId, now);
  if (!resolution.record) {
    return unavailableEstimate(
      inputTokens,
      outputTokens,
      "missing",
      resolution.message,
    );
  }
  if (resolution.state === "stale") {
    return unavailableEstimate(
      inputTokens,
      outputTokens,
      "stale",
      resolution.message,
      resolution.record,
    );
  }
  return estimateCostFromPriceRecord(
    resolution.record,
    inputTokens,
    outputTokens,
    now,
  );
}
