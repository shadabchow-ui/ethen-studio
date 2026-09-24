import { getGatewayRouteProfile } from "../routes";
import type {
  GatewayCatalogModelRecord,
  GatewayCatalogProviderRecord,
  GatewayCatalogStatus,
  GatewayCatalogStatusKind,
  GatewayModelCapabilityFamily,
  GatewayModelCatalogModel,
} from "./types";

/**
 * Simplified, user-facing status vocabulary that collapses the internal
 * GatewayCatalogStatusKind into the five states surfaces across UI and headers.
 *
 * - live            provider configured, adapter wired, in a default route profile
 * - mock            provider uses mock fallback (isMockMode)
 * - setup-required  provider key not present or env not configured
 * - unavailable     unsupported modality or adapter not implemented
 * - unknown         no provider health record in this environment
 */
export type ModelProviderStatus = "live" | "mock" | "setup-required" | "unavailable" | "unknown";

/**
 * Map an internal GatewayCatalogStatusKind to the simplified ModelProviderStatus.
 * Pass `usesMockFallback` from the provider health record when available.
 */
export function deriveModelStatus(
  statusKind: GatewayCatalogStatusKind,
  usesMockFallback?: boolean,
): ModelProviderStatus {
  // Missing keys must stay setup-required. Gateway never silently mocks
  // a production provider just because credentials are absent.
  if (usesMockFallback && statusKind !== "missing-key") return "mock";
  switch (statusKind) {
    case "runnable":
      return "live";
    case "provider-configured":
      return "unknown";
    case "missing-key":
      return "setup-required";
    case "unsupported-modality":
      return "unavailable";
    case "catalog-only":
      return "unknown";
    default:
      return "unknown";
  }
}
import {
  BUILT_IN_PROVIDERS,
  getProviderCertification,
  isProviderLaunchReady,
} from "../../metadata";
import { getGatewayProviderHealthSummary } from "@ethen/security/provider-health";
import { loadModelDetailPages } from "./model-detail-loader";

const TEXT_COMPATIBLE_FAMILIES = new Set<GatewayModelCapabilityFamily>([
  "text",
  "code",
  "reasoning",
  "long-context",
]);

const UNSUPPORTED_MODALITY_FAMILIES = new Set<GatewayModelCapabilityFamily>([
  "image",
  "video",
  "embedding",
  "rerank",
  "realtime",
  "speech",
  "transcription",
]);

const ROUTE_IDS = [
  "text-general",
  "text-quality",
  "text-creative",
  "text-reasoning",
] as const;

function buildDefaultRouteModelSet(): Map<string, Set<string>> {
  const providerModels = new Map<string, Set<string>>();

  ROUTE_IDS.forEach((routeId) => {
    const profile = getGatewayRouteProfile(routeId);
    Object.entries(profile.models ?? {}).forEach(([providerId, modelId]) => {
      if (!modelId) {
        return;
      }

      const current = providerModels.get(providerId) ?? new Set<string>();
      current.add(modelId);
      providerModels.set(providerId, current);
    });
  });

  return providerModels;
}

function normalizeProviderId(provider: string): string {
  return provider.trim().toLowerCase();
}

// GW-PROVIDER-TRUTH (G4): catalog model_ids are provider-prefixed
// ("openai/gpt-4o-mini") while route profiles carry unprefixed ids
// ("gpt-4o-mini"). A prefixed-vs-unprefixed mismatch made "runnable" status
// unreachable — strip the provider prefix before comparing.
function routeModelIdForProvider(modelId: string, providerId: string): string {
  const prefix = `${providerId}/`;
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

function buildCatalogStatus(input: {
  kind: GatewayCatalogStatusKind;
  detail: string;
  providerHealthStatus: string | null;
  providerLabel: string | null;
  adapterImplemented: boolean;
  codingModeReady: boolean;
}): GatewayCatalogStatus {
  const labels: Record<GatewayCatalogStatusKind, string> = {
    "catalog-only": "Catalog only",
    "provider-configured": "Provider configured",
    runnable: "Runnable",
    "unsupported-modality": "Unsupported modality",
    "missing-key": "Missing key",
  };
  const tones: Record<GatewayCatalogStatusKind, GatewayCatalogStatus["tone"]> = {
    "catalog-only": "neutral",
    "provider-configured": "info",
    runnable: "success",
    "unsupported-modality": "warning",
    "missing-key": "danger",
  };

  return {
    kind: input.kind,
    label: labels[input.kind],
    tone: tones[input.kind],
    detail: input.detail,
    providerHealthStatus: input.providerHealthStatus,
    providerLabel: input.providerLabel,
    adapterImplemented: input.adapterImplemented,
    codingModeReady: input.codingModeReady,
  };
}

function toSafeSingleSegmentSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getPlainModelId(modelId: string, providerSlugValue: string): string {
  const lowered = modelId.trim().toLowerCase();
  const prefix = `${providerSlugValue.toLowerCase()}/`;
  if (lowered.startsWith(prefix)) {
    return modelId.trim().slice(prefix.length);
  }
  const parts = modelId.trim().split("/");
  return parts.at(-1) ?? modelId.trim();
}

export async function buildGatewayCatalogRecords(
  models: GatewayModelCatalogModel[],
): Promise<GatewayCatalogModelRecord[]> {
  const providerHealthSummary = getGatewayProviderHealthSummary();
  const healthByProvider = new Map(
    providerHealthSummary.providers.map((provider) => [provider.id, provider]),
  );
  const metadataByProvider = new Map(
    BUILT_IN_PROVIDERS.map((provider) => [provider.id, provider]),
  );
  const defaultRouteModels = buildDefaultRouteModelSet();

  const detailPages = await loadModelDetailPages();
  const detailLookup = new Map<string, { modelSlug: string; canonicalPath: string }>();
  for (const page of detailPages) {
    const existing = detailLookup.get(`${page.providerSlug}:${page.modelId}`);
    if (!existing || page.modelSlug.length < existing.modelSlug.length) {
      detailLookup.set(`${page.providerSlug}:${page.modelId}`, {
        modelSlug: page.modelSlug,
        canonicalPath: page.canonicalPath,
      });
    }
  }

  return models.map((model) => {
    const runtimeProviderId = normalizeProviderId(model.provider);
    const health = healthByProvider.get(runtimeProviderId) ?? null;
    const metadata = metadataByProvider.get(runtimeProviderId) ?? null;
    const defaultModelForRoute =
      defaultRouteModels
        .get(runtimeProviderId)
        ?.has(routeModelIdForProvider(model.model_id, runtimeProviderId)) ??
      false;
    const adapterImplemented = health?.adapterImplemented ?? false;
    const codingModeReady = health?.codingModeReady ?? false;

    let status: GatewayCatalogStatus;

    if (UNSUPPORTED_MODALITY_FAMILIES.has(model.capabilityFamily)) {
      status = buildCatalogStatus({
        kind: "unsupported-modality",
        detail:
          "The current gateway runtime only exposes read-only catalog discovery for this modality. Execution is not wired up yet.",
        providerHealthStatus: health?.status ?? null,
        providerLabel: metadata?.label ?? health?.label ?? null,
        adapterImplemented,
        codingModeReady,
      });
    } else if (health?.status === "missing-key") {
      status = buildCatalogStatus({
        kind: "missing-key",
        detail:
          "A matching gateway provider exists, but the required server-side key is not configured in this environment.",
        providerHealthStatus: health.status,
        providerLabel: health.label,
        adapterImplemented,
        codingModeReady,
      });
    } else if (health?.configured && adapterImplemented && defaultModelForRoute && metadata && isProviderLaunchReady(metadata)) {
      status = buildCatalogStatus({
        kind: "runnable",
        detail:
          "This exact provider/model pair is referenced by the current gateway route profiles, configured, and has dated certification evidence.",
        providerHealthStatus: health.status,
        providerLabel: health.label,
        adapterImplemented,
        codingModeReady,
      });
    } else if (health?.configured && adapterImplemented && TEXT_COMPATIBLE_FAMILIES.has(model.capabilityFamily)) {
      status = buildCatalogStatus({
        kind: "provider-configured",
        detail:
          "The provider adapter is configured, but it lacks dated certification evidence or this model is not explicitly declared in the current gateway route profiles.",
        providerHealthStatus: health.status,
        providerLabel: health.label,
        adapterImplemented,
        codingModeReady,
      });
    } else if (health?.configured && adapterImplemented && model.capabilityFamily === "unknown") {
      status = buildCatalogStatus({
        kind: "provider-configured",
        detail:
          "The provider adapter is configured, but the CSV does not label this model's modality clearly enough to mark it runnable.",
        providerHealthStatus: health.status,
        providerLabel: health.label,
        adapterImplemented,
        codingModeReady,
      });
    } else {
      status = buildCatalogStatus({
        kind: "catalog-only",
        detail:
          "This model is visible in the catalog, but the current repo does not contain enough runtime evidence to claim it is executable.",
        providerHealthStatus: health?.status ?? null,
        providerLabel: metadata?.label ?? health?.label ?? null,
        adapterImplemented,
        codingModeReady,
      });
    }

    const rawModelId = model.model_id.trim();
    const plainModelId = getPlainModelId(rawModelId, model.providerSlug);
    const primaryKey = `${model.providerSlug}:${rawModelId}`;
    const plainKey = `${model.providerSlug}:${plainModelId}`;

    let modelDetailSlug: string | undefined;
    let modelDetailHref: string | undefined;

    const primaryDetail = detailLookup.get(primaryKey) ?? detailLookup.get(plainKey);
    if (primaryDetail) {
      modelDetailSlug = primaryDetail.modelSlug;
      modelDetailHref = primaryDetail.canonicalPath;
    } else {
      modelDetailSlug = toSafeSingleSegmentSlug(rawModelId);
      modelDetailHref = `/model-library/${model.providerSlug}/${modelDetailSlug}`;
    }

    return {
      ...model,
      status,
      providerKnown: Boolean(metadata || health),
      certification: getProviderCertification(runtimeProviderId),
      runtimeProviderId: health ? runtimeProviderId : null,
      providerCategory: metadata?.category ?? null,
      defaultModelForRoute,
      modelDetailSlug,
      modelDetailHref,
    };
  });
}

export function buildGatewayCatalogProviderRecords(
  models: GatewayCatalogModelRecord[],
): GatewayCatalogProviderRecord[] {
  const providerHealthSummary = getGatewayProviderHealthSummary();
  const healthByProvider = new Map(
    providerHealthSummary.providers.map((provider) => [provider.id, provider]),
  );
  const metadataByProvider = new Map(
    BUILT_IN_PROVIDERS.map((provider) => [provider.id, provider]),
  );
  const grouped = new Map<string, GatewayCatalogModelRecord[]>();

  models.forEach((model) => {
    const current = grouped.get(model.providerSlug) ?? [];
    current.push(model);
    grouped.set(model.providerSlug, current);
  });

  return [...grouped.entries()]
    .map(([providerSlug, providerModels]) => {
      const first = providerModels[0];
      const runtimeProviderId = first.runtimeProviderId;
      const metadata = runtimeProviderId ? metadataByProvider.get(runtimeProviderId) ?? null : null;
      const health = runtimeProviderId ? healthByProvider.get(runtimeProviderId) ?? null : null;
      const statuses = providerModels.reduce<Record<GatewayCatalogStatusKind, number>>(
        (counts, model) => {
          counts[model.status.kind] += 1;
          return counts;
        },
        {
          "catalog-only": 0,
          "provider-configured": 0,
          runnable: 0,
          "unsupported-modality": 0,
          "missing-key": 0,
        },
      );

      return {
        provider: first.provider,
        providerSlug,
        providerLabel: metadata?.label ?? health?.label ?? first.provider,
        runtimeProviderId,
        providerKnown: Boolean(metadata || health),
        certification: getProviderCertification(runtimeProviderId ?? providerSlug),
        providerCategory: metadata?.category ?? null,
        catalogModelCount: providerModels.length,
        runnableModelCount: statuses.runnable,
        configuredModelCount: statuses["provider-configured"],
        missingKeyModelCount: statuses["missing-key"],
        unsupportedModalityModelCount: statuses["unsupported-modality"],
        defaultRouteModelCount: providerModels.filter((model) => model.defaultModelForRoute).length,
        capabilityFamilies: [...new Set(providerModels.map((model) => model.capabilityFamily))].sort(),
        statuses,
        health: {
          status: health?.status ?? null,
          configured: health?.configured ?? false,
          setupRequired: health?.setupRequired ?? false,
          usesMockFallback: health?.usesMockFallback ?? false,
          detail: health?.detail ?? null,
          adapterImplemented: health?.adapterImplemented ?? false,
          codingModeReady: health?.codingModeReady ?? false,
        },
      };
    })
    .sort((left, right) => left.providerSlug.localeCompare(right.providerSlug));
}
