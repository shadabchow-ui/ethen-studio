import { loadCanonicalModelRegistry } from "./canonical-registry";
import { BENCHMARK_REGISTRY, getLeaderboard } from "./evaluation";
import { evidenceHealthStatus } from "./evidence";
import {
  recommendModels,
  type RecommendationCandidate,
  type RecommendationRequest,
} from "./recommendation";
import { listRuntimeStates } from "./runtime-overlay";

export const MI_API_VERSION = "v1" as const;
export const MI_COMPARE_MIN_MODELS = 2;
export const MI_COMPARE_MAX_MODELS = 5;

export class ModelIntelligenceApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = "ModelIntelligenceApiError";
  }
}

export function listModels() {
  return loadCanonicalModelRegistry().records;
}

export function getModel(id: string) {
  return listModels().find((model) => model.identity.id === id || model.identity.slug === id) ?? null;
}

export function listProviders() {
  return [...new Set(listModels().map((model) => model.identity.providerId))].sort();
}

export function listBenchmarks() {
  return BENCHMARK_REGISTRY.map((benchmark) => ({
    ...benchmark,
    results: getLeaderboard(benchmark.id, []),
    resultState: "DATA_NOT_AVAILABLE" as const,
  }));
}

export function compareModels(ids: readonly string[]) {
  if (ids.length < MI_COMPARE_MIN_MODELS || ids.length > MI_COMPARE_MAX_MODELS) {
    throw new ModelIntelligenceApiError(
      "MI_COMPARE_MODEL_COUNT_INVALID",
      `Compare requires ${MI_COMPARE_MIN_MODELS} to ${MI_COMPARE_MAX_MODELS} models.`,
      400,
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new ModelIntelligenceApiError("MI_COMPARE_DUPLICATE_MODEL", "Compare model ids must be unique.", 400);
  }
  const models = ids.map(getModel);
  const missing = ids.filter((_, index) => models[index] === null);
  if (missing.length) {
    throw new ModelIntelligenceApiError("MI_MODEL_NOT_FOUND", `Unknown canonical model: ${missing.join(", ")}.`, 404);
  }
  return models;
}

function toRecommendationCandidate(model: ReturnType<typeof listModels>[number]): RecommendationCandidate {
  const runtime = listRuntimeStates().find((state) => state.canonicalModelId === model.identity.id);
  return {
    id: model.identity.id,
    providerId: model.identity.providerId,
    capabilities: {
      streaming: model.capabilities.streaming,
      functionCalling: model.capabilities.functionCalling,
      vision: model.capabilities.vision,
      audio: model.capabilities.audio,
      codeExecution: model.capabilities.codeExecution,
    },
    contextTokens: model.context.maxTokens,
    referenceCostUsd: model.pricing[0]?.priceUsd ?? null,
    quality: null,
    certified: null,
    runtime: runtime
      ? {
          health: runtime.health,
          available: runtime.freshness === "fresh" && runtime.health === "healthy",
          latencyMs: runtime.metrics.p50LatencyMs,
          reliability: runtime.metrics.successRate,
          observedCostUsd: runtime.metrics.avgCostUsd,
        }
      : undefined,
  };
}

export function recommend(request: RecommendationRequest, candidates: readonly RecommendationCandidate[] = listModels().map(toRecommendationCandidate)) {
  return recommendModels(candidates, request);
}

export function health() {
  const registry = loadCanonicalModelRegistry();
  const runtime = listRuntimeStates();
  return {
    version: MI_API_VERSION,
    healthy: registry.issues.length === 0 && registry.unresolvedInvalidRecords.length === 0,
    canonicalRegistry: {
      models: registry.records.length,
      sourceRecords: registry.sourceRecordCount,
      aggregateExclusions: registry.intentionalExclusions.length,
      issues: registry.issues.length,
      unresolvedInvalidRecords: registry.unresolvedInvalidRecords.length,
    },
    evidence: { status: evidenceHealthStatus(["unknown"]), state: "unknown" as const },
    evaluation: {
      benchmarks: BENCHMARK_REGISTRY.length,
      resultState: "DATA_NOT_AVAILABLE" as const,
    },
    runtime: {
      states: runtime.length,
      unknown: runtime.filter((state) => state.freshness === "unknown" || state.freshness === "unavailable").length,
    },
    recommendation: {
      // MI-P0-06: recommendation readiness fails closed. The recommendation
      // service can only produce a "ready" recommendation when the canonical
      // registry is healthy AND non-empty AND free of unresolved invalid
      // records — the required quality/certification/policy inputs. A null or
      // incomplete input surface returns not-ready, never a blanket true.
      ready:
        registry.records.length > 0 &&
        registry.issues.length === 0 &&
        registry.unresolvedInvalidRecords.length === 0,
      policyVersion: "mi-recommendation-r6.0",
      reasonCodes: [
        ...(registry.records.length === 0 ? ["no_canonical_records"] : []),
        ...(registry.issues.length > 0 ? ["registry_has_issues"] : []),
        ...(registry.unresolvedInvalidRecords.length > 0
          ? ["unresolved_invalid_records"]
          : []),
      ],
    },
  };
}
