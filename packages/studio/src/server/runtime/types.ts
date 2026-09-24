/** Studio V5 runtime — shared types (STUDIO_05 owns this folder). Server-only. */
import "server-only";
import type { TaskName } from "../../contracts/tasks";
import type { VersionPins } from "../../contracts/versions";
import type { JobStatus } from "../../contracts/execution";
import type { ProjectScope } from "../../contracts/scope";

/** Canonical dispatch queues for the Studio execution fleet. */
export const STUDIO_WORKFLOW_QUEUE = "studio-workflow-control";
export const STUDIO_PROVIDER_QUEUE = "studio-provider-wait";
export const STUDIO_MEDIA_QUEUE = "studio-media-cpu";

export type RuntimeErrorCode =
  | "ADMISSION_CONFLICT"
  | "ADMISSION_CLOSED"
  | "QUOTE_CONFLICT"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "INVALID_TRANSITION"
  | "STALE_WORKER"
  | "LEASE_LOST"
  | "AMBIGUOUS_SUBMIT"
  | "CALLBACK_REJECTED"
  | "CANCEL_CONFLICT"
  | "INTERNAL";

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

export const RUNTIME_ERROR_STATUS: Readonly<Record<RuntimeErrorCode, number>> = {
  ADMISSION_CONFLICT: 409,
  ADMISSION_CLOSED: 503,
  QUOTE_CONFLICT: 409,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_TRANSITION: 409,
  STALE_WORKER: 409,
  LEASE_LOST: 409,
  AMBIGUOUS_SUBMIT: 409,
  CALLBACK_REJECTED: 401,
  CANCEL_CONFLICT: 409,
  INTERNAL: 500,
};

/**
 * Durable Studio job row. `dispatchGeneration` is the fencing token: every
 * worker mutation must present the generation it claimed, and a mismatch
 * means a stale (expired/reclaimed) worker that must stop.
 */
export interface RuntimeJob {
  readonly jobId: string;
  readonly scope: ProjectScope;
  readonly task: TaskName;
  readonly status: JobStatus;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly quoteId: string;
  readonly reservationId: string | null;
  readonly pins: VersionPins;
  readonly endpointId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  /** Monotonic fence bumped on every lease claim/reclaim. */
  readonly dispatchGeneration: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly cancelReason: string | null;
  readonly legacyOrigin: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One provider dispatch attempt. Dispatch/poll/ingest tracked separately. */
export type AttemptPhase = "dispatch" | "poll" | "ingest" | "settle";

export interface RuntimeAttempt {
  readonly attemptId: string;
  readonly jobId: string;
  readonly scope: ProjectScope;
  readonly attemptNumber: number;
  readonly dispatchGeneration: number;
  readonly operationKey: string;
  readonly phase: AttemptPhase;
  readonly status: JobStatus;
  readonly providerOperationId: string | null;
  /** True once the submit outcome is unknown — resubmit is forbidden. */
  readonly submitAmbiguous: boolean;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type OutboxStatus = "pending" | "leased" | "acked" | "dead";
export type OutboxTarget = "temporal_dispatch" | "callback" | "settlement" | "notification";

export interface DispatchOutboxEvent {
  readonly eventId: string;
  readonly jobId: string;
  readonly scope: ProjectScope;
  readonly target: OutboxTarget;
  readonly dedupeKey: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly leaseGeneration: number;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly createdAt: string;
}

export type ProviderOperationState =
  | "SUBMITTED"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED"
  | "UNKNOWN";

export interface ProviderOperation {
  readonly operationId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly scope: ProjectScope;
  readonly operationKey: string;
  readonly providerOperationId: string | null;
  readonly state: ProviderOperationState;
  readonly redactedError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RuntimeGeneration {
  readonly generationId: string;
  readonly jobId: string;
  readonly attemptId: string;
  readonly scope: ProjectScope;
  readonly assetVersionIds: readonly string[];
  /** Late outputs after cancel/revocation land here, never as live results. */
  readonly quarantined: boolean;
  readonly quarantineReason: string | null;
  readonly createdAt: string;
}

export interface JobEvent {
  readonly eventId: string;
  readonly jobId: string;
  readonly scope: ProjectScope;
  readonly eventKey: string;
  readonly sequence: number;
  readonly type: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Measurable execution stage only — no fake percent. `percent` is present
 * solely when the provider/ingest reports a real fraction.
 */
export interface JobProgress {
  readonly jobId: string;
  readonly status: JobStatus;
  readonly stage: string;
  readonly percent: number | null;
  readonly attemptNumber: number;
  readonly detail: string | null;
}

export function requireText(value: string, field: string): void {
  if (!value || value.trim().length === 0) {
    throw new RuntimeError("INVALID_INPUT", `${field} is required.`);
  }
}

/**
 * Legacy compatibility projection. Maps the old local Studio FSM
 * (job-orchestrator STUDIO_JOB_STATES) and shared-platform job states onto
 * the canonical V5 enum. History rows are never rewritten.
 */
export function projectRuntimeLegacyStatus(legacy: string): JobStatus {
  const upper = legacy.toUpperCase();
  const map: Readonly<Record<string, JobStatus>> = {
    VALIDATING: "QUEUED",
    ESTIMATING: "QUEUED",
    QUEUED: "QUEUED",
    SUBMITTING: "RUNNING",
    PROVIDER_QUEUED: "RUNNING",
    RUNNING: "RUNNING",
    PROCESSING: "INGESTING",
    FINALIZING: "SETTLING",
    MODERATING: "INGESTING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCEL_REQUESTED: "CANCEL_REQUESTED",
    CANCELED: "CANCELLED",
    CANCELLED: "CANCELLED",
    TIMED_OUT: "EXPIRED",
    RETRYING: "RECONCILING",
    DEAD_LETTERED: "FAILED",
    CLAIMED: "RUNNING",
    POLLING: "RUNNING",
    DISPATCHED: "RUNNING",
    INDETERMINATE: "RECONCILING",
    HALT_UNSAFE: "FAILED",
    DEAD_LETTER: "FAILED",
  };
  const projected = map[upper];
  if (!projected) throw new RuntimeError("INVALID_INPUT", `unmappable legacy job status: ${legacy}`);
  return projected;
}
