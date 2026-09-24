import type { GatewayModelCatalogModel } from "./gateway/model-catalog/types";
import { getPriceRecord as getCanonicalPriceRecord } from "./pricing-registry";
import {
  BUILT_IN_PROVIDERS,
  getProviderCertification,
  getProviderMetadata,
  isProviderLaunchReady,
} from "./metadata";

export type PriceConfidence = "high" | "medium" | "low";
export type PriceUnit = "per-token" | "per-request" | "per-second";

/**
 * Only a record satisfying this shape can be used by a billing caller. OCR
 * catalog cells are represented as unverified evidence, never as this type.
 */
export interface PriceRecord {
  modelId: string;
  sourceType: "official_provider";
  source: string;
  retrievedAt: string;
  currency: string;
  unit: PriceUnit;
  confidence: PriceConfidence;
  expiresAt: string;
  inputPricePerUnit: number | null;
  outputPricePerUnit: number | null;
}

export interface RegistryModelRecord {
  id: string;
  providerId: string;
  name: string | null;
  nameReason: string | null;
  contextWindow: null;
  contextWindowReason: string;
  priceRecords: PriceRecord[];
  unverifiedPriceReason: string | null;
}

export function assertPriceRecord(value: Partial<PriceRecord>): asserts value is PriceRecord {
  const required = ["modelId", "sourceType", "source", "retrievedAt", "currency", "unit", "confidence", "expiresAt"] as const;
  for (const field of required) {
    if (!value[field]) throw new Error(`Price record is missing required ${field}.`);
  }
  if (Number.isNaN(Date.parse(value.retrievedAt!)) || Number.isNaN(Date.parse(value.expiresAt!))) {
    throw new Error("Price record must contain valid retrieval and expiry dates.");
  }
  if (value.sourceType !== "official_provider") {
    throw new Error("Only official provider sources can be billing authority.");
  }
}

export function isBillablePriceRecord(record: PriceRecord, now = new Date()): boolean {
  assertPriceRecord(record);
  const retrievedAt = new Date(record.retrievedAt).getTime();
  const expiresAt = new Date(record.expiresAt).getTime();
  const maximumFreshnessMs = 30 * 24 * 60 * 60 * 1_000;
  return (
    expiresAt > now.getTime() &&
    expiresAt > retrievedAt &&
    expiresAt - retrievedAt <= maximumFreshnessMs
  );
}

/** Resolve only a current official record from the versioned price authority. */
export function getBillablePriceRecord(modelId: string, now = new Date()): PriceRecord | null {
  // Dynamic import is avoided here so billing callers receive a synchronous,
  // deterministic answer from the sole versioned price registry.
  const record = getCanonicalPriceRecord(modelId);
  if (!record || record.sourceType !== "official_provider") return null;
  return isBillablePriceRecord(record, now) ? record : null;
}

export function getRegistryModelRecord(model: GatewayModelCatalogModel): RegistryModelRecord {
  const price = getCanonicalPriceRecord(model.model_id);
  return {
    id: model.model_id,
    providerId: model.providerSlug,
    name: model.model_name,
    nameReason: model.model_name ? null : "The legacy catalog does not provide a verified model name.",
    contextWindow: null,
    contextWindowReason: "Legacy catalog context values are unverified and cannot be registry authority.",
    priceRecords: price ? [price] : [],
    unverifiedPriceReason: price
      ? null
      : "Legacy OCR-derived pricing has no dated source provenance and is excluded from billable authority.",
  };
}

export {
  BUILT_IN_PROVIDERS,
  getProviderCertification,
  getProviderMetadata,
  isProviderLaunchReady,
};
