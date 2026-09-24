import "server-only";

import type {
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaModality,
} from "@ethen/contracts/media/types";
import { getProviderAdapter, getProviderMeta, type MediaProviderId } from "./providers/index";
import type { MediaProviderAdapter } from "./providers/types";
import { setupRequiredError } from "./errors";

// ── Router selection criteria ────────────────────────────────────────────────

export interface RouterSelectionCriteria {
  modality: MediaModality;
  /** Specific capability requested (e.g. "text-to-image"). */
  capability?: string;
  /** Requested model id. If absent, use provider default. */
  modelId?: string | null;
  qualityPreference?: "starter" | "balanced" | "premium";
  latencyPreference?: "fast" | "balanced" | "patient";
  /** Provider id explicitly requested. Takes priority over auto-selection. */
  providerId?: string | null;
}

export interface RouterSelectionResult {
  adapter: MediaProviderAdapter;
  providerId: string;
  selectedModelId: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
  fallbackProviderId?: string;
}

// ── Provider selection order per modality ────────────────────────────────────
//
// ROUTE-IDENTITY/LIVE-PATH-SIMULATION-REMOVAL-01 (STU-P0-09): mock is NOT part
// of the automatic fallback order. A live request whose real providers are
// unavailable fails with a typed setup-required error; mock output is produced
// ONLY when the caller explicitly requests provider "mock" (explicit demo
// action). Provider failure must never render mock success.
const PROVIDER_ORDER: Record<MediaModality, MediaProviderId[]> = {
  image: ["cortex", "openai", "replicate", "fal", "stability"],
  video: ["cortex", "fal", "runway", "replicate", "kling", "luma", "pika"],
  audio: ["cortex", "elevenlabs", "replicate"],
};

export { PROVIDER_ORDER };

/**
 * Select a media provider based on criteria.
 *
 * Always prefers an explicitly-requested provider. Falls back through the
 * modality-specific order of REAL providers. Mock is never auto-selected:
 * an explicit `providerId: "mock"` request is honored (explicit demo action);
 * otherwise, when no real provider is available, a typed setup-required error
 * is thrown so a failed/absent provider can never look like a completed job.
 */
export function selectMediaProvider(criteria: RouterSelectionCriteria): RouterSelectionResult {
  const { modality, providerId: requestedProvider, modelId: requestedModel } = criteria;

  // Explicit mock request — the documented demo boundary. Honored only when
  // explicitly named, never as a fallback.
  if (requestedProvider === "mock") {
    const adapter = tryProvider("mock", criteria.capability);
    if (adapter) {
      return {
        adapter,
        providerId: "mock",
        selectedModelId: requestedModel ?? "default",
        fallbackUsed: false,
      };
    }
  }

  // If a specific real provider is requested, try it first.
  if (requestedProvider) {
    const explicit = tryProvider(requestedProvider as MediaProviderId, criteria.capability);
    if (explicit) {
      return {
        adapter: explicit,
        providerId: requestedProvider,
        selectedModelId: requestedModel ?? "default",
        fallbackUsed: false,
      };
    }
  }

  // Walk the modality order (real providers only).
  const order = PROVIDER_ORDER[modality] ?? [];
  let primaryFailed = false;
  let primaryReason: string | undefined;
  let primaryId: string | undefined;

  for (const providerId of order) {
    const adapter = tryProvider(providerId, criteria.capability);
    if (adapter) {
      if (primaryFailed) {
        return {
          adapter,
          providerId,
          selectedModelId: requestedModel ?? "default",
          fallbackUsed: true,
          fallbackReason: primaryReason ?? `Provider ${primaryId} was unavailable.`,
          fallbackProviderId: primaryId,
        };
      }
      return {
        adapter,
        providerId,
        selectedModelId: requestedModel ?? "default",
        fallbackUsed: false,
      };
    }
    if (!primaryFailed) {
      primaryFailed = true;
      primaryId = providerId;
      const meta = getProviderMeta(providerId);
      primaryReason = meta
        ? `${meta.label} adapter is not yet available.`
        : `Provider ${providerId} is unknown.`;
    }
  }

  // No real provider is available. Fail closed — never fall back to mock.
  throw setupRequiredError(
    requestedProvider
      ? `Provider "${requestedProvider}" is not available and no other media provider is configured.`
      : "No media provider is available. Configure a provider or explicitly request provider \"mock\" for a demo run.",
  );
}

export interface MediaRouter {
  selectProvider(criteria: RouterSelectionCriteria): RouterSelectionResult;
  generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse>;
}

export const mediaRouter: MediaRouter = {
  selectProvider(criteria: RouterSelectionCriteria): RouterSelectionResult {
    return selectMediaProvider(criteria);
  },

  async generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    const selection = selectMediaProvider({
      modality: request.modality ?? "image",
      capability: request.capability ?? undefined,
      modelId: request.modelId,
      providerId: request.providerId,
      qualityPreference: request.qualityPreference,
      latencyPreference: request.latencyPreference,
    });

    const result = await selection.adapter.generate({
      ...request,
      modelId: request.modelId ?? (selection.selectedModelId !== "default" ? selection.selectedModelId : undefined),
      providerId: selection.providerId,
    });

    if (selection.fallbackUsed && result.provider && result.metadata) {
      result.provider.fallbackUsed = true;
      result.metadata.setupRequiredReason = selection.fallbackReason;
    }

    return result;
  },
};

function tryProvider(
  providerId: MediaProviderId,
  capability?: string,
): MediaProviderAdapter | null {
  const adapter = getProviderAdapter(providerId);
  if (!adapter) return null;
  const status = adapter.getStatus();
  if (!status.available) return null;
  if (capability && providerId !== "mock") {
    const capabilities = status.capabilities ?? [];
    if (!capabilities.includes(capability)) return null;
  }
  return adapter;
}
