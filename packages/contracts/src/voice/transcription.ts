/**
 * packages/contracts/voice/transcription.ts
 *
 * VOI-10 — Contracts for the OpenAI transcription production lane.
 *
 * This module only defines the transcription-specific result surface
 * (transcript records, capabilities, canary gating) on top of the
 * Product 09 Voice authorities (VOI-05 approved audio assets, VOI-06/07
 * durable jobs + usage, VOI-03 canonical provider registry).
 */

/** Provider operation registry identity for the transcription lane. */
export type TranscriptionOperation = "transcription";

/** Canonical registry provider identity. */
export type TranscriptionProviderId = "openai";

/** Approval/model capability gate for a transcription model. */
export type TranscriptionModelStatus =
  | "audit_candidate" // present in catalog, NOT certified for production
  | "configured_not_certified" // credentials present, no exact-SHA canary evidence
  | "certified"; // exact-SHA canary + provider readiness evidence exists

/**
 * Bounded transcript record persisted for a project. Durable-safe: only text,
 * provider/model pin, input hash, retention, and audit evidence. No raw audio,
 * no base64, no provider-hosted URLs as durable assets.
 */
export interface TranscriptionTranscript {
  id: string;
  organizationId: string | null;
  projectId: string;
  actorId: string;
  jobId: string;
  /** Approved VOI-05 audio asset record id (the immutable input). */
  inputAssetId: string;
  inputHash: string;
  provider: TranscriptionProviderId;
  model: string;
  status: "completed" | "failed" | "cancelled";
  /** The normalized transcript text. Empty only when proven empty. */
  text?: string;
  /** ISO-8601 language code when the provider/audit verified it. */
  language?: string;
  /** Confidence 0..1 ONLY when the provider actually returns it. */
  confidence?: number;
  /** Segments/timestamps ONLY when audited and certified. Never fabricated. */
  segments?: never[];
  createdAtIso: string;
  retentionMs: number;
  /** AI-generated speech disclosure (playback/export/provenance). */
  isAiGenerated: boolean;
  providerDurationMs?: number;
}

/** Default bounded transcript retention (60 days). */
export const DEFAULT_TRANSCRIPT_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

/** Allowed audio MIME allowlist (from OpenAI file-transcription primary evidence). */
export const ALLOWED_TRANSCRIPTION_MIME_TYPES: readonly string[] = [
  "audio/mpeg",
  "audio/mp4",
  "audio/mpga",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
];

/** Hard 25MB cap from OpenAI file transcription primary evidence. */
export const MAX_TRANSCRIPTION_INPUT_BYTES = 25 * 1024 * 1024;
