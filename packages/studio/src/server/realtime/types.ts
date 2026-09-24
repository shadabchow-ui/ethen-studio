/** Studio V5 realtime — shared types and errors (STUDIO_16, server-only). */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { IcuAmount } from "../../contracts/money";
import type { ProjectScope } from "../../contracts/scope";
import type { TaskName } from "../../contracts/tasks";
import type { ConnectedInterval, RealtimeSessionStatus } from "../../contracts/realtime";

/** Typed realtime-layer failure carrying a kernel API error code. */
export class RealtimeError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "RealtimeError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, this.retryable, this.details);
  }
}

export function realtimeError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  retryable = false,
): RealtimeError {
  return new RealtimeError(code, message, details, retryable);
}

/** HTTP status projection for RealtimeError codes (route adapters). */
export const REALTIME_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVISION: 409,
  QUOTE_EXPIRED: 410,
  APPROVAL_REQUIRED: 403,
  QUOTA_EXCEEDED: 429,
  POLICY_DENIED: 403,
  CONSENT_REQUIRED: 403,
  ENDPOINT_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * Explicit transport mode configuration. "pipeline" is the server STT→LLM→TTS
 * pipeline; "native" is a native realtime provider model attachment. The mode
 * is chosen at admission and pinned on the session — never silently switched.
 */
export type RealtimeTransportMode = "pipeline" | "native";

export const REALTIME_TRANSPORT_MODES: readonly RealtimeTransportMode[] = ["pipeline", "native"];

export function isRealtimeTransportMode(value: string): value is RealtimeTransportMode {
  return (REALTIME_TRANSPORT_MODES as readonly string[]).includes(value);
}

/** Managed media substrate target. Synthetic exists for tests only. */
export type RealtimeSubstrate = "livekit-managed" | "synthetic";

export const REALTIME_SUBSTRATES: readonly RealtimeSubstrate[] = ["livekit-managed", "synthetic"];

/** Immutable agent/model/voice/policy snapshot pinned before any connect. */
export interface RealtimeAgentSnapshot {
  agentId: string;
  agentVersion: string;
  name: string;
  provider: string;
  model: string;
  voiceBindingId: string;
  instructionsHash: string;
  toolsHash: string | null;
  policyVersion: string;
  pricingVersion: string;
  transportMode: RealtimeTransportMode;
  capturedAt: string;
}

export type RealtimeEndReason =
  | "stopped"
  | "spend_cap"
  | "revoked"
  | "provider_closed"
  | "crash_recovery"
  | "inactivity"
  | "error";

export const REALTIME_END_REASONS: readonly RealtimeEndReason[] = [
  "stopped",
  "spend_cap",
  "revoked",
  "provider_closed",
  "crash_recovery",
  "inactivity",
  "error",
];

/** Explicit recording retention choice; consent grant is required to record. */
export type RealtimeRecordingRetention = "none" | "session" | "project_default";

export const REALTIME_RECORDING_RETENTIONS: readonly RealtimeRecordingRetention[] = [
  "none",
  "session",
  "project_default",
];

/**
 * Durable realtime session. Money lives in economics (reservationId); this
 * record owns admission state, epochs, intervals, tool scope and events.
 */
export interface RealtimeSessionRecord {
  sessionId: string;
  scope: ProjectScope;
  status: RealtimeSessionStatus;
  epoch: number;
  agentSnapshot: RealtimeAgentSnapshot;
  identityBindingId: string | null;
  /** Integer ICU hard cap for the session. */
  spendCapIcu: IcuAmount;
  /** Highest reservation the session may top up to (authorized ceiling). */
  ceilingIcu: IcuAmount;
  /** Metered spend so far (integer ICU). */
  spentIcu: IcuAmount;
  /** Integer ICU per connected second (pinned from the quote). */
  rateIcuPerSecond: IcuAmount;
  /** j04 reservation id once reserved; null before admission completes. */
  reservationId: string | null;
  /** j04 quote id the reservation was taken against. */
  quoteId: string | null;
  /** Total ICU reserved across the initial hold plus atomic topups. */
  reservedIcu: IcuAmount;
  /** Number of applied topups (monotonic; drives idempotency). */
  topupCount: number;
  /** Approved tool scope ids; empty means no tool may execute. */
  toolScopeIds: readonly string[];
  /** Revoked scope ids — revoked sessions stop and stay stopped. */
  revokedScopeIds: readonly string[];
  consentGrantId: string | null;
  recordingRetention: RealtimeRecordingRetention;
  endReason: RealtimeEndReason | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
}

/** One connection epoch: reconnects bump the epoch, never reuse it. */
export interface RealtimeEpochRecord {
  sessionId: string;
  epoch: number;
  transportCredentialId: string | null;
  startedAt: string;
  endedAt: string | null;
}

/** One connected interval. Billing sums closed intervals only; gaps excluded. */
export interface RealtimeIntervalRecord {
  intervalId: string;
  sessionId: string;
  epoch: number;
  startedAt: string;
  endedAt: string | null;
}

export type { ConnectedInterval, RealtimeSessionStatus };

/**
 * Short-lived scoped client transport credential. Binds session + epoch +
 * expiry; it authorizes media-plane attachment only, never provider admin or
 * economics. Revoked/terminal sessions stop instead of minting.
 */
export interface RealtimeTransportCredential {
  credentialId: string;
  sessionId: string;
  epoch: number;
  substrate: RealtimeSubstrate;
  /** Opaque token material handed to the browser transport only. */
  token: string;
  issuedAt: string;
  expiresAt: string;
  ttlSeconds: number;
  revoked: boolean;
}

/** Maximum client transport credential lifetime (seconds). */
export const REALTIME_CREDENTIAL_MAX_TTL_SECONDS = 600;

/** Normalized session event envelope (viewer + metering input). */
export type RealtimeEventType =
  | "session.created"
  | "session.connected"
  | "session.disconnected"
  | "user.speech_started"
  | "user.speech_stopped"
  | "transcript.partial"
  | "transcript.final"
  | "agent.thinking"
  | "agent.speaking_started"
  | "agent.speaking_stopped"
  | "agent.interrupted"
  | "tool.called"
  | "tool.completed"
  | "tool.failed"
  | "error.provider"
  | "error.network"
  | "session.ended";

export const REALTIME_EVENT_TYPES: readonly RealtimeEventType[] = [
  "session.created",
  "session.connected",
  "session.disconnected",
  "user.speech_started",
  "user.speech_stopped",
  "transcript.partial",
  "transcript.final",
  "agent.thinking",
  "agent.speaking_started",
  "agent.speaking_stopped",
  "agent.interrupted",
  "tool.called",
  "tool.completed",
  "tool.failed",
  "error.provider",
  "error.network",
  "session.ended",
];

export function isRealtimeEventType(value: string): value is RealtimeEventType {
  return (REALTIME_EVENT_TYPES as readonly string[]).includes(value);
}

export interface RealtimeSessionEvent {
  eventId: string;
  sessionId: string;
  epoch: number;
  sequence: number;
  type: RealtimeEventType;
  text: string;
  /** Provider-side dedupe key; duplicates are acknowledged, never re-applied. */
  providerEventId: string | null;
  clientAt: string;
  appendedAt: string;
  payload: Readonly<Record<string, unknown>>;
  contentHash: string;
}

/** Tool invocation lifecycle (requested → approved/denied → completed/failed). */
export type RealtimeToolStatus =
  | "requested"
  | "awaiting_approval"
  | "approved"
  | "denied"
  | "completed"
  | "failed";

export const REALTIME_TOOL_STATUSES: readonly RealtimeToolStatus[] = [
  "requested",
  "awaiting_approval",
  "approved",
  "denied",
  "completed",
  "failed",
];

export interface RealtimeToolCall {
  callId: string;
  sessionId: string;
  epoch: number;
  /** Canonical task the tool executes under (same task policy as batch). */
  task: TaskName;
  toolName: string;
  toolScopeId: string;
  args: Readonly<Record<string, unknown>>;
  argsHash: string;
  status: RealtimeToolStatus;
  approvalId: string | null;
  decisionCode: string | null;
  resultRedacted: unknown;
  requestedAt: string;
  decidedAt: string | null;
}

/** Session admission limits (bounded; fail-closed defaults). */
export interface RealtimeSessionLimits {
  maxDurationMs: number;
  inactivityTimeoutMs: number;
  maxConcurrentSessionsPerProject: number;
  maxSpendIcuPerSession: IcuAmount;
  enrollmentRequired: boolean;
}

/** Minimal approval port (payload-bound, expiring, one-time claim). */
export interface RealtimeApprovalPort {
  request(input: {
    sessionId: string;
    callId: string;
    toolScopeId: string;
    argsHash: string;
    actorId: string;
    expiresAt: string;
  }): Promise<{ approvalId: string; expiresAt: string }>;
  authorize(input: {
    approvalId: string;
    sessionId: string;
    callId: string;
    argsHash: string;
    actorId: string;
    now: string;
  }): Promise<{ allowed: boolean; code: string }>;
  deny(approvalId: string, actorId: string, reason: string): Promise<void>;
}

/** Readiness of the realtime plane. Closed is honest, never a fake token. */
export type RealtimeReadiness =
  | { ready: true; substrate: RealtimeSubstrate; transportMode: RealtimeTransportMode }
  | { ready: false; code: "REALTIME_TRANSPORT_UNAVAILABLE" | "REALTIME_SUBSTRATE_UNCONFIGURED"; reason: string };
