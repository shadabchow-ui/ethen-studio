import "server-only";

import { mockMediaProvider } from "./mock";
import { cortexMediaProvider } from "./cortex";
import { openaiImageProvider } from "./openai";
import { falVideoProvider } from "./fal";
import { genericVideoProvider } from "./generic-video";
import type { MediaProviderAdapter, MediaProviderMeta } from "./types";
import type { MediaProviderId, MediaProviderModelEntry } from "./types";
export type { MediaProviderId, MediaProviderModelEntry };
export { PROVIDER_MODEL_ENTRIES, getProviderModelEntries, getProviderModelEntry } from "./models";
import { setupRequiredError } from "../errors";
import type { MediaGenerationRequest, MediaGenerationResponse, MediaProviderStatus } from "@ethen/contracts/media/types";

// ── Provider registry ────────────────────────────────────────────────────────

const PROVIDER_REGISTRY: Record<string, MediaProviderAdapter> = {
  mock: mockMediaProvider,
  cortex: cortexMediaProvider,
  openai: openaiImageProvider,
  replicate: buildSetupRequiredShim("replicate", "Replicate", "REPLICATE_API_TOKEN"),
  fal: falVideoProvider,
  elevenlabs: buildSetupRequiredShim("elevenlabs", "ElevenLabs", "ELEVENLABS_API_KEY"),
  runway: buildSetupRequiredShim("runway", "Runway", "RUNWAY_API_SECRET"),
  kling: buildSetupRequiredShim("kling", "Kling", "KLING_API_KEY"),
  luma: buildSetupRequiredShim("luma", "Luma", "LUMA_API_KEY"),
  pika: buildSetupRequiredShim("pika", "Pika", "PIKA_API_KEY"),
  stability: buildSetupRequiredShim("stability", "Stability", "STABILITY_API_KEY"),
  "generic-video": genericVideoProvider,
  custom: buildSetupRequiredShim("custom", "Custom Media Provider", "CUSTOM_MEDIA_API_KEY"),
};

export const PROVIDER_METAS: MediaProviderMeta[] = [
  { id: "mock", label: "Mock media provider", modalities: ["image", "video", "audio"], capabilities: [], requiresApiKey: false, requiresBaseUrl: false, adapterNotImplemented: false, supportsImage: true, supportsVideo: true, supportsAudio: true, estimatedCost: "not provided", status: "mock", displayName: "Mock Media Provider", outputTypes: ["image", "video", "audio"], inputTypes: ["text"] },
  { id: "cortex", label: "Cortex", modalities: ["image", "video", "audio"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: false, supportsImage: true, supportsVideo: true, supportsAudio: true, estimatedCost: "not provided", envRequired: ["CORTEX_API_KEY"], status: "setup-required", displayName: "Cortex", outputTypes: ["image", "video", "audio"], inputTypes: ["text"] },
  { id: "openai", label: "OpenAI", modalities: ["image"], capabilities: ["text-to-image"], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: false, supportsImage: true, estimatedCost: "~6-10 credits", envRequired: ["OPENAI_API_KEY"], status: "live", displayName: "OpenAI", outputTypes: ["image"], inputTypes: ["text"] },
  { id: "replicate", label: "Replicate", modalities: ["image", "video", "audio"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsImage: true, supportsVideo: true, estimatedCost: "not provided", envRequired: ["REPLICATE_API_TOKEN"], status: "planned", displayName: "Replicate", outputTypes: ["image", "video", "audio"], inputTypes: ["text"] },
  { id: "fal", label: "fal.ai", modalities: ["video"], capabilities: ["image-to-video"], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: false, supportsImage: false, supportsVideo: true, estimatedCost: "~12-36 credits", envRequired: ["FAL_KEY"], status: "live", displayName: "fal.ai", outputTypes: ["video"], inputTypes: ["text", "image"] },
  { id: "elevenlabs", label: "ElevenLabs", modalities: ["audio"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsAudio: true, estimatedCost: "not provided", envRequired: ["ELEVENLABS_API_KEY"], status: "planned", displayName: "ElevenLabs", outputTypes: ["audio"], inputTypes: ["text", "audio"] },
  { id: "runway", label: "Runway", modalities: ["video"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsVideo: true, estimatedCost: "not provided", envRequired: ["RUNWAY_API_SECRET"], status: "planned", displayName: "Runway", outputTypes: ["video"], inputTypes: ["text"] },
  { id: "kling", label: "Kling", modalities: ["video"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsVideo: true, estimatedCost: "not provided", envRequired: ["KLING_API_KEY"], status: "planned", displayName: "Kling", outputTypes: ["video"], inputTypes: ["text"] },
  { id: "luma", label: "Luma", modalities: ["video"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsVideo: true, estimatedCost: "not provided", envRequired: ["LUMA_API_KEY"], status: "planned", displayName: "Luma", outputTypes: ["video"], inputTypes: ["text"] },
  { id: "pika", label: "Pika", modalities: ["video"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsVideo: true, estimatedCost: "not provided", envRequired: ["PIKA_API_KEY"], status: "planned", displayName: "Pika", outputTypes: ["video"], inputTypes: ["text"] },
  { id: "stability", label: "Stability", modalities: ["image"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsImage: true, estimatedCost: "not provided", envRequired: ["STABILITY_API_KEY"], status: "planned", displayName: "Stability", outputTypes: ["image"], inputTypes: ["text"] },
  { id: "generic-video", label: "Generic Video", modalities: ["video"], capabilities: ["text-to-video"], requiresApiKey: true, requiresBaseUrl: true, adapterNotImplemented: false, supportsVideo: true, estimatedCost: "not provided", envRequired: ["GENERIC_VIDEO_API_URL", "GENERIC_VIDEO_API_KEY"], status: "setup-required", displayName: "Generic Video Provider", outputTypes: ["video"], inputTypes: ["text"] },
  { id: "custom", label: "Custom", modalities: ["image", "video", "audio"], capabilities: [], requiresApiKey: true, requiresBaseUrl: false, adapterNotImplemented: true, supportsImage: true, supportsVideo: true, supportsAudio: true, supportsGameAssets: true, estimatedCost: "not provided", envRequired: ["CUSTOM_MEDIA_API_KEY"], status: "planned", displayName: "Custom Media Provider", outputTypes: ["image", "video", "audio", "game_asset"], inputTypes: ["text"] },
];

export function getProviderAdapter(providerId: string): MediaProviderAdapter | undefined {
  return PROVIDER_REGISTRY[providerId];
}

export function getProviderMeta(providerId: string): MediaProviderMeta | undefined {
  return PROVIDER_METAS.find((meta) => meta.id === providerId);
}

export function getAllProviderStatus(): MediaProviderStatus[] {
  return PROVIDER_METAS.map((meta) => {
    const adapter = PROVIDER_REGISTRY[meta.id];
    return adapter.getStatus();
  });
}

// ── Setup-required shim helper ───────────────────────────────────────────────

function buildSetupRequiredShim(
  id: string,
  label: string,
  envKey: string,
): MediaProviderAdapter {
  return {
    providerId: id,
    label,
    getAvailability() {
      return {
        available: false,
        missingEnv: [envKey],
        reason: `${label} adapter is not yet implemented in this repo.`,
      };
    },
    getStatus(): MediaProviderStatus {
      return {
        id,
        label,
        modality: "multi",
        mode: "setup-required",
        available: false,
        configured: false,
        setupRequired: true,
        setupRequiredReason: `${label} adapter is not yet implemented in this repo.`,
        lastCheckedAt: new Date().toISOString(),
        trust: "not_provided",
      };
    },
    getCostEstimate(_request: MediaGenerationRequest) {
      return null;
    },
    async generate(_request: MediaGenerationRequest): Promise<MediaGenerationResponse> {
      throw setupRequiredError(`${label} media generation is not yet available.`);
    },
  };
}
