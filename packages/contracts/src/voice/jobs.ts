/**
 * packages/contracts/voice/jobs.ts
 *
 * VOI-06 — Durable Voice Job Runtime.
 *
 * Canonical durable job model for Voice product work (TTS speech, transcription).
 * Every provider call must reference a durable job row and a usage reservation.
 * The state machine covers validation, estimation, reservation, queueing,
 * submission, provider running, result ingestion, moderation/disclosure,
 * finalization, completion, failure, cancellation, timeout, retry, and
 * dead letter.
 */

/** Voice job kind. Realtime sessions are governed by their own durable session
 * authority (VOI-11) and are intentionally not modeled as jobs here. */
export type VoiceJobKind = "tts" | "transcription";

/** Full durable job state machine (mandate: validation → … → dead letter). */
export const VOICE_JOB_STATES = [
  "validating",
  "estimating",
  "reserving",
  "queued",
  "submitting",
  "provider_running",
  "ingesting",
  "moderating",
  "finalizing",
  "completed",
  "failed",
  "cancel_requested",
  "cancelled",
  "timed_out",
  "retrying",
  "dead_lettered",
] as const;

export type VoiceJobState = (typeof VOICE_JOB_STATES)[number];

/** Provider run lifecycle — the per-attempt provider interaction record. */
export type VoiceProviderRunState =
  | "created"
  | "submitted"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

/** Usage reservation lifecycle. Refund policy details are owned by VOI-07. */
export type VoiceUsageEntryType = "reservation" | "charge" | "refund" | "audit";

export const VOICE_TERMINAL_STATES: ReadonlySet<VoiceJobState> = new Set([
  "completed",
  "failed",
  "cancelled",
  "timed_out",
  "dead_lettered",
]);

export const VOICE_ACTIVE_STATES: ReadonlySet<VoiceJobState> = new Set([
  "queued",
  "submitting",
  "provider_running",
  "ingesting",
  "moderating",
  "finalizing",
  "retrying",
  "cancel_requested",
]);

/**
 * Immutable submission snapshot. Everything the provider call and the
 * settlement depend on is pinned here at submit time: provider, adapter
 * version, model, voice, operation policy, pricing version, immutable input
 * snapshot, project, actor, and authorization scope.
 */
export interface VoiceJobSubmission {
  organizationId: string;
  projectId: string;
  actorId: string;
  kind: VoiceJobKind;
  /** Deterministic duplicate-suppression key (per project). */
  idempotencyKey: string;
  /** Immutable request snapshot — never mutated after submit. */
  immutableInput: Readonly<Record<string, unknown>>;
  providerId: string;
  adapterVersion: string;
  modelId: string;
  voiceId: string | null;
  policyVersion: string;
  pricingVersion: string;
  costEstimate: Readonly<Record<string, unknown>>;
  /** Mandatory bound for the provider attempt; worker timeouts on it. */
  timeoutAt: string;
  /** AI-generated speech disclosure requirement (playback/export/provenance). */
  disclosureRequired: boolean;
  maxAttempts?: number;
  backoffBaseSeconds?: number;
}

export interface VoiceJob extends VoiceJobSubmission {
  id: string;
  state: VoiceJobState;
  attemptCount: number;
  maxAttempts: number;
  backoffBaseSeconds: number;
  scheduledAt: string;
  leaseWorkerId: string | null;
  leaseExpiresAt: string | null;
  cancellationRequestedAt: string | null;
  cancellationReason: string | null;
  result: Readonly<Record<string, unknown>> | null;
  /** Usage reservation id recorded before any provider call. */
  usageReservationId: string | null;
  settlement: Readonly<Record<string, unknown>> | null;
  deadLetterAt: string | null;
  deadLetterReason: string | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceJobEvent {
  id: string;
  jobId: string;
  organizationId: string;
  projectId: string;
  providerRunId: string | null;
  /** Dedupe key — provider events use the provider event id. */
  eventKey: string;
  /** Monotonic ordering guard within a job. */
  sequence: number;
  type: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
}

export interface VoiceProviderRun {
  id: string;
  jobId: string;
  organizationId: string;
  projectId: string;
  providerId: string;
  adapterVersion: string;
  modelId: string;
  /** Set exactly once by the idempotent submission; never resubmitted. */
  providerRunKey: string | null;
  state: VoiceProviderRunState;
  lastSequence: number;
  createdAt: string;
  updatedAt: string;
}

/** Provider-origin event (polling or webhook ingestion contract). */
export interface VoiceProviderEvent {
  /** Provider-side event id — idempotency key for ingestion. */
  providerEventId: string;
  jobId: string;
  type: "queued" | "running" | "completed" | "failed" | "cancelled";
  sequence: number;
  occurredAt: string;
  payload?: Readonly<Record<string, unknown>>;
}

export interface VoiceUsageEntry {
  id: string;
  organizationId: string;
  projectId: string;
  jobId: string;
  actorId: string;
  entryType: VoiceUsageEntryType;
  amount: number;
  currency: string;
  idempotencyKey: string;
  details: Readonly<Record<string, unknown>>;
  createdAt: string;
}

/** Finalization result contract — the lane must key assets deterministically
 * (e.g. `${jobId}/${providerRunKey}`) so crash-recovery re-runs can never
 * create a duplicate audio asset or transcript. */
export interface VoiceFinalizationResult {
  /** Stable per-attempt finalization identity (providerRunKey). */
  finalizationId: string;
  assetId?: string | null;
  assetKey?: string | null;
  audioUrl?: string | null;
  transcript?: string | null;
  durationSeconds?: number | null;
  characterCount?: number | null;
  format?: string | null;
  [key: string]: unknown;
}

export interface VoiceJobListOptions {
  status?: VoiceJobState;
  kind?: VoiceJobKind;
  limit?: number;
  offset?: number;
}
