import {
  assertPriceRecord,
  getRegistryModelRecord,
  isBillablePriceRecord,
  isProviderLaunchReady,
} from "../registry";
import { getProviderMetadata } from "../metadata";
import { loadModelPricingCatalog, resetModelPricingCache } from "../gateway/platform/pricing";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrows(action: () => void, message: string) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

// Schema: records lacking provenance cannot become pricing authority.
expectThrows(
  () => assertPriceRecord({ modelId: "example", currency: "USD", unit: "per-token", expiresAt: "2027-01-01T00:00:00.000Z" }),
  "price records without source, retrieval date, and confidence must be rejected",
);

const expired = {
  modelId: "example",
  sourceType: "official_provider" as const,
  source: "https://provider.example/pricing",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  currency: "USD",
  unit: "per-token" as const,
  confidence: "high" as const,
  expiresAt: "2026-01-02T00:00:00.000Z",
  inputPricePerUnit: 1,
  outputPricePerUnit: 1,
};
assert(!isBillablePriceRecord(expired, new Date("2026-02-01T00:00:00.000Z")), "expired prices must be excluded from billable authority");

const openai = getProviderMetadata("openai");
assert(
  openai !== null && isProviderLaunchReady(openai, new Date("2026-07-27T00:00:00.000Z")),
  "a provider with a current passing receipt should be launch-ready",
);

const legacyModel = getRegistryModelRecord({
  model_id: "unknown/example",
  provider: "Unknown",
  model_name: null,
  capability_family: null,
  context_window: "999999",
  max_output_tokens: null,
  latency: null,
  throughput: null,
  input_price: "$1/M",
  output_price: "$1/M",
  cache_read_price: null,
  cache_write_price: null,
  web_search_price: null,
  capabilities: null,
  source_files: null,
  extraction_confidence: "medium",
  notes: null,
  providerSlug: "unknown",
  capabilityFamily: "unknown",
  capabilityTags: [],
  sourceFileList: [],
  extractionConfidence: "medium",
});
assert(legacyModel.name === null && legacyModel.priceRecords.length === 0, "registry must not fabricate model names or prices from legacy defaults");

async function verifyLegacyCatalogIsNotBillable() {
  resetModelPricingCache();
  const pricing = await loadModelPricingCatalog();
  assert(pricing.size === 0, "OCR-derived catalog prices must not enter the billable pricing catalog");
  console.log("Provider registry behavioral tests passed.");
}

verifyLegacyCatalogIsNotBillable().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
