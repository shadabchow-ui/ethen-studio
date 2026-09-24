import "server-only";

import type {
  MediaCapability,
  MediaGenerationRequest,
  MediaGenerationResponse,
  MediaJob,
  MediaModality,
  MediaProviderStatus,
  ProviderError,
} from "@ethen/contracts/media/types";

// ── Media provider adapter ───────────────────────────────────────────────────

export interface MediaProviderAdapter {
  /** Stable provider identifier (e.g. "cortex", "openai", "replicate"). */
  readonly providerId: string;
  /** Human-readable provider label. */
  readonly label: string;
  /** Whether this adapter is safe to call (env configured, not degraded). */
  getAvailability(): MediaProviderAvailability;
  /** Build a status snapshot for the provider-status route. */
  getStatus(): MediaProviderStatus;
  /** Cost estimate metadata for a given request. */
  getCostEstimate(request: MediaGenerationRequest): MediaCostEstimate | null;
  /**
   * Generate media. Returns the job record with state and result metadata.
   * Throws ProviderError on failure.
   */
  generate(request: MediaGenerationRequest): Promise<MediaGenerationResponse>;
  /**
   * Poll an async job for completion. Not all providers support this.
   * Returns null when polling is not supported for the given job.
   */
  poll?(jobId: string): Promise<MediaJob | null>;
  /**
   * Cancel an in-progress job. Not all providers support this.
   * Returns null when cancellation is not supported.
   */
  cancel?(jobId: string): Promise<MediaJob | null>;
}

export interface MediaProviderAvailability {
  available: boolean;
  /** When false, the env variable(s) that are missing or unset. */
  missingEnv?: string[];
  /** Human-readable reason when available is false. */
  reason?: string;
}

export interface MediaCostEstimate {
  providerId: string;
  modelId: string;
  minCredits: number;
  maxCredits: number;
  /** "estimated" = real estimate; "tier_only" = approximate based on model tier; "not_available" = unknown. */
  status: "estimated" | "tier_only" | "not_available";
  note?: string;
}

// ── Provider registry ────────────────────────────────────────────────────────

export type MediaProviderId =
  | "mock"
  | "cortex"
  | "openai"
  | "replicate"
  | "fal"
  | "elevenlabs"
  | "runway"
  | "kling"
  | "luma"
  | "pika"
  | "stability"
  | "generic-video"
  | "custom";

export interface MediaProviderMeta {
  id: MediaProviderId;
  label: string;
  modalities: MediaModality[];
  capabilities: MediaCapability[];
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
  /** True when no real adapter implementation exists in this repo. */
  adapterNotImplemented: boolean;
  /** Input types this provider accepts. */
  inputTypes?: string[];
  /** Output types this provider produces. */
  outputTypes?: string[];
  /** Whether this provider supports async generation. */
  supportsAsync?: boolean;
  /** Whether this provider supports image generation. */
  supportsImage?: boolean;
  /** Whether this provider supports video generation. */
  supportsVideo?: boolean;
  /** Whether this provider supports audio generation. */
  supportsAudio?: boolean;
  /** Whether this provider supports game asset generation. */
  supportsGameAssets?: boolean;
  /** Estimated cost label (placeholder text, not real pricing). */
  estimatedCost?: string;
  /** Environment variable key(s) required for configuration. */
  envRequired?: string[];
  /** Default status for this provider. */
  status?: string;
  /** Fallback provider id when this provider is unavailable. */
  fallbackProvider?: string;
  /** Display name for the provider in UI contexts. */
  displayName?: string;
}

// ── Provider-model entry ─────────────────────────────────────────────────────

export interface MediaProviderModelEntry {
  providerId: MediaProviderId;
  modelId: string;
  displayName: string;
  capability: string;
  inputTypes: string[];
  outputTypes: string[];
  supportsAsync: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsGameAssets: boolean;
  estimatedCost: string;
  envRequired: string[];
  status: "mock" | "setup-required" | "live" | "disabled" | "unavailable" | "failed" | "fallback" | "planned";
  fallbackProvider?: MediaProviderId;
}
