/**
 * packages/contracts/voice/storage.ts
 *
 * VOI-05 — secure audio uploads, private object storage, assets, and lineage.
 *
 * Core shapes for the Voice audio quarantine → validation → approved storage
 * lifecycle. These types are intentionally provider-agnostic and durable-safe:
 * production audio never travels as base64 or a provider-hosted URL. A Voice
 * audio record references a private project-scoped object key, carries proven
 * integrity (sha256), a positive scanner decision, and an immutable asset/
 * lineage identity once approved.
 *
 * Every record is organization-, project-, and actor-scoped. Access is never
 * authorized from an object ID alone.
 */

import type { VoiceProviderId } from "@ethen/contracts/voice/types";

/** Voice audio pipeline lifecycle state (fail-closed). */
export type VoiceAudioRecordState =
  | "quarantined" // received, no approved validation/scanner decision yet
  | "rejected" // validation or scanner failure — never movable to approved
  | "approved"; // validated + scanner-clean + integrity persisted

/** Supported voice audio container types. */
export type VoiceAudioContainer =
  | "wav"
  | "mp3"
  | "ogg"
  | "opus" // ogg container with Opus codec
  | "flac"
  | "m4a"
  | "unknown";

/** Where the audio originated. */
export type VoiceAudioSource =
  | "user_upload" // inbound submission (quarantine + validation on ingest)
  | "provider_output" // synthetic audio returned by a provider, mirrored into Ethen storage
  | "waveform_preview" // derived (non-authoritative) preview
  | "export"; // signed, disclosed AI-synthesis export

export interface VoiceAudioMetadata {
  container: VoiceAudioContainer;
  codec: string | null;
  sampleRateHz: number | null;
  channels: number | null;
  bitrateKbps: number | null;
  durationSeconds: number | null;
  sizeBytes: number;
}

/** Governed DX screen metadata (provider/model/voice/operation provenance). */
export interface VoiceAudioProvenance {
  providerId?: string | null;
  modelId?: string | null;
  voiceId?: string | null;
  routingMode?: string | null;
  operation?: "transcribe_input" | "speech_output" | "upload" | "waveform" | null;
}

export interface VoiceAudioRecord {
  id: string;
  projectId: string;
  organizationId: string | null;
  actorId: string;
  state: VoiceAudioRecordState;
  source: VoiceAudioSource;
  /** Immutable canonical object key in the tenant project-objects bucket. */
  objectKey: string | null;
  originalFilename: string | null;
  contentType: string | null;
  sha256: string | null;
  scannerStatus: "clean" | "quarantined" | "rejected" | "scanner_unavailable" | null;
  metadata: VoiceAudioMetadata | null;
  provenance: VoiceAudioProvenance;
  idempotencyKey: string | null;
  retentionDays: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceAudioCreateInput {
  projectId: string;
  organizationId?: string | null;
  actorId: string;
  source: VoiceAudioSource;
  originalFilename?: string | null;
  contentType?: string | null;
  provenance?: Partial<VoiceAudioProvenance>;
  idempotencyKey?: string | null;
  retentionDays?: number | null;
}

export interface VoiceAudioApprovalInput {
  sha256: string;
  metadata: VoiceAudioMetadata;
  objectKey: string;
  contentType: string;
}

/** A rejected/quarantined transition reason, stored for audit. */
export interface VoiceAudioRejection {
  recordId: string;
  projectId: string;
  actorId: string;
  reason: string;
  code: string;
  occurredAt: string;
}
