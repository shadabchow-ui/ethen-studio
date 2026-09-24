import "server-only";

import { getServerEnv, hasConfiguredServerEnv } from "@ethen/config/env";
import type {
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaModality,
  MediaProviderStatus,
} from "@ethen/contracts/media/types";
import type { MediaProviderAdapter, MediaProviderAvailability, MediaCostEstimate } from "./types";
import { setupRequiredError } from "../errors";

// ── Cortex env keys ──────────────────────────────────────────────────────────

const CORTEX_API_KEY = "CORTEX_API_KEY";
const CORTEX_API_BASE_URL = "CORTEX_API_BASE_URL";
const CORTEX_DEFAULT_IMAGE_MODEL = "CORTEX_DEFAULT_IMAGE_MODEL";
const CORTEX_DEFAULT_VIDEO_MODEL = "CORTEX_DEFAULT_VIDEO_MODEL";
const CORTEX_DEFAULT_AUDIO_MODEL = "CORTEX_DEFAULT_AUDIO_MODEL";

// ── Env helpers ──────────────────────────────────────────────────────────────

function hasCortexConfig(): boolean {
  return hasConfiguredServerEnv(CORTEX_API_KEY);
}

function getCortexBaseUrl(): string | undefined {
  return getServerEnv(CORTEX_API_BASE_URL);
}

function getCortexDefaultModel(modality: MediaModality): string | undefined {
  switch (modality) {
    case "image":
      return getServerEnv(CORTEX_DEFAULT_IMAGE_MODEL);
    case "video":
      return getServerEnv(CORTEX_DEFAULT_VIDEO_MODEL);
    case "audio":
      return getServerEnv(CORTEX_DEFAULT_AUDIO_MODEL);
  }
}

function getMissingEnv(): string[] {
  const missing: string[] = [];
  if (!hasConfiguredServerEnv(CORTEX_API_KEY)) missing.push(CORTEX_API_KEY);
  // Base URL is optional — Cortex may have a default endpoint
  return missing;
}

// The Cortex API endpoint and request schema are not present in this repo.
// When they become available, wire real HTTP calls here.
const CORTEX_NOT_IMPLEMENTED_REASON = "not provided — Cortex media API endpoint and request schema are not present in this repo.";

export const cortexMediaProvider: MediaProviderAdapter = {
  providerId: "cortex",
  label: "Cortex",

  getAvailability(): MediaProviderAvailability {
    const configured = hasCortexConfig();
    if (!configured) {
      return {
        available: false,
        missingEnv: [CORTEX_API_KEY],
        reason: "CORTEX_API_KEY is not configured.",
      };
    }
    return {
      available: false,
      missingEnv: getMissingEnv(),
      reason: CORTEX_NOT_IMPLEMENTED_REASON,
    };
  },

  getStatus(): MediaProviderStatus {
    const configured = hasCortexConfig();
    const baseUrlKnown = getCortexBaseUrl() !== undefined;
    return {
      id: "cortex",
      label: "Cortex",
      modality: "multi",
      mode: configured ? "setup-required" : "setup-required",
      available: false,
      configured,
      setupRequired: true,
      setupRequiredReason: configured
        ? CORTEX_NOT_IMPLEMENTED_REASON
        : "CORTEX_API_KEY is not configured.",
      lastCheckedAt: new Date().toISOString(),
      trust: configured ? "setup_required" : "not_provided",
    };
  },

  getCostEstimate(_request: MediaGenerationRequest): MediaCostEstimate | null {
    return null;
  },

  async generate(_request: MediaGenerationRequest): Promise<MediaGenerationResponse> {
    throw setupRequiredError("Cortex media generation is not implemented. " + CORTEX_NOT_IMPLEMENTED_REASON);
  },
};
