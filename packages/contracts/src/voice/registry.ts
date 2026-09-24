/**
 * packages/contracts/voice/registry.ts
 * VOI-03: Canonical, versioned, evidence-bound provider/model/voice/operation
 * authority contracts.
 *
 * The live repo is the authority. This registry replaces the competing
 * `voiceProviderRegistry` (mock-only) and `voiceServerAdapterRegistry`
 * (adapter) layers with ONE runtime authority used by routing, APIs, UI,
 * usage, and certification.
 */

import type {
  VoiceProviderCapabilities,
  VoiceProviderId,
} from "@ethen/contracts/voice/types";

/**
 * Provider lifecycle state machine (VOI-03 mandate #5).
 *
 * Escalating verification for hosted providers:
 *   not_configured → configured_unverified → credential_verified →
 *   capability_verified → canary_verified → certified
 *
 * Degraded / non-progress states:
 *   degraded, rate_limited, insufficient_provider_credits, provider_locked,
 *   failed, disabled, deprecated
 */
export type VoiceProviderState =
  | "not_configured"
  | "configured_unverified"
  | "credential_verified"
  | "capability_verified"
  | "canary_verified"
  | "certified"
  | "degraded"
  | "rate_limited"
  | "insufficient_provider_credits"
  | "provider_locked"
  | "failed"
  | "disabled"
  | "deprecated"
  | "not_in_scope"; // deferred / outside V1 (e.g. telephony, cloning)

export type VoiceCapabilityId = "tts" | "stt" | "realtime" | "cloning" | "local";

export type VoiceFormat = "mp3" | "wav" | "opus" | "flac" | "aac" | "pcm";

export type VoiceLatencyClass = "low" | "medium" | "high" | "not_applicable";

export type VoiceCatalogSource =
  | "static"
  | "provider_api"
  | "manual"
  | "not_available";

export type CredentialSource =
  | "env"
  | "byok"
  | "browser_extension"
  | "mock"
  | "none";

export type ProviderHealth = "healthy" | "degraded" | "down" | "unknown";

export type ModelEntryState = "unverified" | "verified" | "deprecated";

export type VoiceEntryState = "released" | "legacy" | "deprecated" | "proposed";

/** Evidence fields (from documentation/certification; no live calls). */
export interface VerificationEvidence {
  documentationSource: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
  certificationRef: string | null;
  lastCanarySha: string | null;
  lastCanaryAt: string | null;
  deprecationPlan:
    | {
        deprecatedAt: string;
        replacement: string | null;
        removalAt: string | null;
        reason: string;
      }
    | null;
}

/** Model fixed-version record (VOI-03 #6/#7). */
export interface CanonicModel {
  id: string;
  label: string;
  providerId: VoiceProviderId;
  entryState: ModelEntryState;
  evidence: VerificationEvidence;
  formats: VoiceFormat[];
  inputLimitChars: number | null;
  languages: string[];
  streaming: boolean;
  latencyClass: VoiceLatencyClass;
}

/** Voice catalogue entry (VOI-03 #3 + #8). */
export interface CanonicVoice {
  id: string;
  name: string;
  providerId: VoiceProviderId;
  gender: "male" | "female" | "neutral";
  accent?: string;
  state: VoiceEntryState;
  evidence: VerificationEvidence;
}

/** One provider record (VOI-03 #2). */
export interface CanonicProvider {
  providerId: VoiceProviderId;
  label: string;
  description: string;
  state: VoiceProviderState;
  capabilities: VoiceProviderCapabilities;
  voiceCatalogSource: VoiceCatalogSource;
  formats: VoiceFormat[];
  inputLimits: { maxTextChars: number | null; maxDurationSec: number | null };
  languages: string[];
  streaming: boolean;
  latencyClass: VoiceLatencyClass;
  retentionPrivacy: string;
  region: string | null;
  priceVersion: string | null;
  credentialSource: CredentialSource;
  configurationKeys: string[];
  health: ProviderHealth;
  fallbackEligible: boolean;
  evidence: VerificationEvidence;
  /** true => permanently-labeled local/dev/test/demo boundary, not production. */
  mockTestBoundary: boolean;
  models: CanonicModel[];
  voices: CanonicVoice[];
}

export interface VoiceSelectionInput {
  providerId?: VoiceProviderId | null;
  modelId?: string | null;
  voiceId?: string | null;
  routingMode: string;
}

export interface EnvConfiguration {
  [providerId: string]: boolean;
}

/** Explicit alternative-route *proposal* metadata — never auto-executed. */
export interface AlternativeRoute {
  providerId: VoiceProviderId | null;
  modelId: string | null;
  voiceId: string | null;
  reason: string;
  autoExecuted: false;
}

export type VoiceSelectionResult =
  | {
      kind: "ok";
      providerId: VoiceProviderId;
      modelId: string;
      voiceId: string;
      state: VoiceProviderState;
      alternatives: AlternativeRoute[];
    }
  | {
      kind: "fail";
      code: string;
      message: string;
      failClosed: true;
      alternatives: AlternativeRoute[];
    };

/** Capability-matrix row (artifact shape). */
export interface CapabilityMatrixRow {
  provider: VoiceProviderId;
  label: string;
  state: VoiceProviderState;
  effectiveState: VoiceProviderState;
  tts: boolean;
  stt: boolean;
  realtime: boolean;
  cloning: boolean;
  local: boolean;
  formats: string[];
  streaming: boolean;
  latencyClass: VoiceLatencyClass;
  languages: string[];
  fallbackEligible: boolean;
  legacyUnverifiedModels: number;
  voiceCatalogSource: VoiceCatalogSource;
}
