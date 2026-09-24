// B0: the catalog moved into `@ethen/models` with the gateway loader.
export const GATEWAY_MODEL_CSV_PATH =
  "packages/models/src/data/gateway-model-catalog/vercel-ai-gateway-models.csv";

export const EXPECTED_GATEWAY_MODEL_CSV_HEADER = [
  "model_id",
  "provider",
  "model_name",
  "capability_family",
  "context_window",
  "max_output_tokens",
  "latency",
  "throughput",
  "input_price",
  "output_price",
  "cache_read_price",
  "cache_write_price",
  "web_search_price",
  "capabilities",
  "source_files",
  "extraction_confidence",
  "notes",
] as const;

export type GatewayModelCsvHeader = (typeof EXPECTED_GATEWAY_MODEL_CSV_HEADER)[number];
export type ExtractionConfidence = "high" | "medium" | "low";

export type GatewayModelCapabilityFamily =
  | "text"
  | "code"
  | "image"
  | "video"
  | "embedding"
  | "rerank"
  | "realtime"
  | "speech"
  | "transcription"
  | "reasoning"
  | "long-context"
  | "unknown";

export type GatewayCatalogStatusKind =
  | "catalog-only"
  | "provider-configured"
  | "runnable"
  | "unsupported-modality"
  | "missing-key";

export interface GatewayModelCatalogRow {
  model_id: string;
  provider: string;
  model_name: string | null;
  capability_family: string | null;
  context_window: string | null;
  max_output_tokens: string | null;
  latency: string | null;
  throughput: string | null;
  input_price: string | null;
  output_price: string | null;
  cache_read_price: string | null;
  cache_write_price: string | null;
  web_search_price: string | null;
  capabilities: string | null;
  source_files: string | null;
  extraction_confidence: string | null;
  notes: string | null;
}

export interface GatewayModelCatalogModel extends GatewayModelCatalogRow {
  providerSlug: string;
  capabilityFamily: GatewayModelCapabilityFamily;
  capabilityTags: string[];
  sourceFileList: string[];
  extractionConfidence: ExtractionConfidence | null;
  /** Static MI identity/capability projection; inventory and runtime fields above remain Gateway-owned. */
  canonicalResolution?: import("../model-intelligence").GatewayCanonicalResolution;
}

export interface GatewayCatalogStatus {
  kind: GatewayCatalogStatusKind;
  label: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  detail: string;
  providerHealthStatus: string | null;
  providerLabel: string | null;
  adapterImplemented: boolean;
  codingModeReady: boolean;
}

export interface GatewayCatalogModelRecord extends GatewayModelCatalogModel {
  status: GatewayCatalogStatus;
  providerKnown: boolean;
  runtimeProviderId: string | null;
  providerCategory: string | null;
  defaultModelForRoute: boolean;
  modelDetailSlug?: string;
  modelDetailHref?: string;
}

export interface GatewayCatalogProviderRecord {
  provider: string;
  providerSlug: string;
  providerLabel: string;
  runtimeProviderId: string | null;
  providerKnown: boolean;
  certification: import("../../metadata").ProviderCertification;
  providerCategory: string | null;
  catalogModelCount: number;
  runnableModelCount: number;
  configuredModelCount: number;
  missingKeyModelCount: number;
  unsupportedModalityModelCount: number;
  defaultRouteModelCount: number;
  capabilityFamilies: GatewayModelCapabilityFamily[];
  statuses: Record<GatewayCatalogStatusKind, number>;
  health: {
    status: string | null;
    configured: boolean;
    setupRequired: boolean;
    usesMockFallback: boolean;
    detail: string | null;
    adapterImplemented: boolean;
    codingModeReady: boolean;
  };
}

export interface GatewayModelCatalogDiagnostics {
  csvPath: string;
  header: string[];
  headerMatchesExpected: boolean;
  rowCount: number;
  parsedCount: number;
  duplicateModelIds: string[];
  droppedDuplicateCount: number;
  invalidConfidenceRows: Array<{
    modelId: string;
    value: string;
  }>;
  missingRequiredRows: Array<{
    rowNumber: number;
    modelId: string | null;
    provider: string | null;
  }>;
}

export interface GatewayModelCatalogSnapshot {
  csvPath: string;
  header: string[];
  models: GatewayModelCatalogModel[];
  diagnostics: GatewayModelCatalogDiagnostics;
}
