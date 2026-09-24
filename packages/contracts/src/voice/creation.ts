/**
 * packages/contracts/voice/creation.ts
 * Voice creation contracts — voice cloning/creation request and status.
 *
 * These types represent the full lifecycle of creating a new voice
 * via provider cloning APIs, gated by consent and rights verification.
 */

import type { VoiceProviderId } from "@ethen/contracts/voice/types";

// ─── Creation Status ────────────────────────────────────────────────────────

export type VoiceCreationStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export type VoiceProviderAvailabilityStatus =
  | "configured"
  | "missing-key"
  | "mock-fallback"
  | "setup-required"
  | "unavailable";

// ─── Request / Response ─────────────────────────────────────────────────────

export interface VoiceCreationRequest {
  /** Source audio samples (base64-encoded WAV/MP3) or URLs */
  sourceAudio: string[];
  /** Name for the new voice */
  voiceName: string;
  /** Consent record ID that authorises this cloning */
  consentRecordId: string;
  /** Target provider for voice creation */
  provider: VoiceProviderId;
  /** Optional description of the voice */
  description?: string;
  /** Optional labels/tags for the voice */
  labels?: string[];
}

export interface VoiceCreationResult {
  ok: boolean;
  providerStatus?: VoiceProviderAvailabilityStatus;
  voice?: CreatedVoice;
  error?: string;
  rightsCheck?: RightsCheckSummary;
}

export interface CreatedVoice {
  id: string;
  name: string;
  description: string;
  providerVoiceId: string;
  provider: VoiceProviderId;
  /** Reference to the consent record that authorised creation */
  consentRef: string;
  /** Whether this voice is gated on consent */
  consentVerified: boolean;
  /** Whether cloning is eligible */
  cloningEligible: boolean;
  /** ISO timestamp */
  createdAt: string;
  /** Labels/tags */
  labels: string[];
}

export interface RightsCheckSummary {
  verified: boolean;
  checks: RightsCheckItem[];
  blocker?: string;
}

export interface RightsCheckItem {
  name: string;
  passed: boolean;
  reason: string;
}

// ─── Provider Clone Connector Interface ─────────────────────────────────────

export interface IVoiceCloner {
  readonly providerId: VoiceProviderId;
  readonly configured: boolean;

  /** Clone/create a voice from source audio samples */
  cloneVoice(config: VoiceCloneConfig): Promise<VoiceCloneResult>;

  /** Check cloning progress */
  getCloneStatus(voiceId: string): Promise<VoiceCloneStatus>;

  /** List voices created via this cloner */
  listClonedVoices(): Promise<CreatedVoice[]>;
}

export interface VoiceCloneConfig {
  name: string;
  description?: string;
  sourceAudio: string[];
  labels?: string[];
}

export interface VoiceCloneResult {
  ok: boolean;
  voiceId?: string;
  status: VoiceCreationStatus;
  error?: string;
}

export interface VoiceCloneStatus {
  voiceId: string;
  status: VoiceCreationStatus;
  progress?: number;
  error?: string;
}
