import currentPriceSet from "./data/gateway-model-catalog/pricing/v2026-08-25.json";
import type { PriceRecord } from "./registry";

export type PriceSourceType = "official_provider";
export type PriceRecordState = "current" | "stale" | "missing";

interface PriceSetRecord {
  id: string;
  modelId: string;
  sourceType: PriceSourceType;
  sourceUrl: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}

export interface VersionedPriceRecord extends PriceRecord {
  id: string;
  version: string;
  sourceType: PriceSourceType;
}

const records: readonly VersionedPriceRecord[] = Object.freeze(
  (currentPriceSet.records as PriceSetRecord[]).map((record) => ({
    id: record.id,
    version: currentPriceSet.version,
    modelId: record.modelId,
    sourceType: record.sourceType,
    source: record.sourceUrl,
    retrievedAt: currentPriceSet.retrievedAt,
    expiresAt: currentPriceSet.expiresAt,
    currency: currentPriceSet.currency,
    unit: currentPriceSet.unit as "per-token",
    confidence: "high" as const,
    inputPricePerUnit: record.inputUsdPerMillionTokens / 1_000_000,
    outputPricePerUnit: record.outputUsdPerMillionTokens / 1_000_000,
  })),
);

export const CURRENT_PRICE_SET_VERSION = currentPriceSet.version;
export const CURRENT_PRICE_RECORDS = records;

export function normalizeBillableModelId(modelId: string): string {
  const trimmed = modelId.trim();
  if (trimmed.includes("/")) return trimmed;
  const anthropic = trimmed.startsWith("claude-");
  return `${anthropic ? "anthropic" : "openai"}/${trimmed}`;
}

export function getPriceRecord(
  modelId: string,
): VersionedPriceRecord | null {
  const normalized = normalizeBillableModelId(modelId);
  return records.find((record) => record.modelId === normalized) ?? null;
}

export function getPriceRecordState(
  modelId: string,
  now = new Date(),
): { state: PriceRecordState; record: VersionedPriceRecord | null; message: string } {
  const record = getPriceRecord(modelId);
  if (!record) {
    return {
      state: "missing",
      record: null,
      message: `No sourced price is registered for ${normalizeBillableModelId(modelId)}.`,
    };
  }
  if (new Date(record.expiresAt).getTime() <= now.getTime()) {
    return {
      state: "stale",
      record,
      message: `Price ${record.id} expired at ${record.expiresAt} and is unusable for billing.`,
    };
  }
  return {
    state: "current",
    record,
    message: `Price ${record.id} is current until ${record.expiresAt}.`,
  };
}
