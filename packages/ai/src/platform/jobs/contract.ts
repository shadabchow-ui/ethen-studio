export const JOB_STATUSES = [
  "queued",
  "claimed",
  "running",
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
  "indeterminate",
  "halt_unsafe",
  "timed_out",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
  "indeterminate",
  "halt_unsafe",
  "timed_out",
]);

export const JOB_STATUS_TRANSITIONS: Readonly<
  Record<JobStatus, readonly JobStatus[]>
> = {
  queued: ["claimed", "cancelled"],
  claimed: [
    "running",
    "queued",
    "failed",
    "cancelled",
    "dead_letter",
    "indeterminate",
    "halt_unsafe",
    "timed_out",
  ],
  running: [
    "completed",
    "failed",
    "cancelled",
    "dead_letter",
    "indeterminate",
    "halt_unsafe",
  ],
  // Terminal statuses. INDETERMINATE may be resolved ONLY through the explicit
  // reconcile-dispatched-job path (reconciliation by a stable dispatch marker),
  // never through a normal transition. HALT_UNSAFE never transitions onward.
  completed: [],
  failed: [],
  cancelled: [],
  dead_letter: [],
  indeterminate: [],
  halt_unsafe: [],
  timed_out: [],
};

export const DEFAULT_QUEUE_NAME = "default" as const;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BACKOFF_BASE_SECONDS = 30;
export const DEFAULT_LEASE_DURATION_SECONDS = 60;
export const MAX_BACKOFF_SECONDS = 3600;

/**
 * Durable worker event trail entry (Job 04). Append-only per job; the worker
 * records lifecycle events (claim, dispatch, terminal) so operators can
 * reconstruct what happened after crashes and reclamation.
 */
export const JOB_EVENT_NAMES = [
  "claimed",
  "dispatched",
  "heartbeat",
  "completed",
  "failed",
  "cancelled",
  "indeterminate",
  "halt_unsafe",
  "dead_lettered",
  "timed_out",
  "retried",
  "admission_checked",
  "escalated",
  "reconciled",
  "execution_control_shadow",
] as const;

export type JobEventName = (typeof JOB_EVENT_NAMES)[number];

export interface JobEvent {
  id: string;
  jobId: string;
  workerId: string | null;
  event: JobEventName;
  detail: Readonly<Record<string, unknown>> | null;
  createdAt: string;
}

export interface JobError {
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
  details: Readonly<Record<string, unknown>>;
}

export interface JobRecord {
  id: string;
  organizationId: string;
  projectId: string;
  queueName: string;
  payload: Readonly<Record<string, unknown>>;
  idempotencyKey: string;
  status: JobStatus;
  priority: number;
  maxAttempts: number;
  attemptCount: number;
  lastError: JobError | null;
  deadLetterAt: string | null;
  deadLetterReason: string | null;
  leaseId: string | null;
  leaseExpiresAt: string | null;
  claimedBy: string | null;
  /**
   * P09 durable fencing generation. 0 at creation; every successful claim
   * (including reclaim after lease expiry) assigns a strictly newer
   * generation. Authoritative worker mutations must present the generation
   * from their claim record — a stale generation is rejected, so an
   * expired/reclaimed worker can never mutate the job. Worker ids alone are
   * not fencing because worker ids may be reused.
   */
  leaseGeneration: number;
  cancellationRequestedAt: string | null;
  cancellationReason: string | null;
  scheduledAt: string;
  backoffBaseSeconds: number;
  createdAt: string;
  updatedAt: string;
  /**
   * Stable external/provider dispatch boundary (GPU-P0-06 / Job 02).
   * Set the instant a provider/external side effect is dispatched, together
   * with the stable reconciliation operation key. Once set, a retryable
   * failure must NOT blind-retry — it lands in `indeterminate` and can only
   * be resolved by reconciliation on the stable marker.
   */
  providerDispatchStartedAt: string | null;
  providerOperationKey: string | null;
  /**
   * P09 operator escalation overlay. The job keeps its truthful status
   * (indeterminate / timed_out) while marked as needing an operator.
   * Escalated jobs are skipped by the deterministic sweeper; uncertainty is
   * never silently converted into a retryable failure.
   */
  escalatedAt: string | null;
  escalationReason: string | null;
  /** P09 reconciliation metadata: last sweep resolution + sweep count. */
  lastReconciledAt: string | null;
  reconcileCount: number;
}

/**
 * True once a job has crossed the external/provider dispatch boundary. Any
 * failure after this point is an *uncertain* outcome, not a clean failure:
 * blind retry is forbidden without a proven stable reconciliation identity.
 */
export function isDispatchBoundaryRecorded(job: Pick<JobRecord, "providerDispatchStartedAt">): boolean {
  return job.providerDispatchStartedAt !== null && job.providerDispatchStartedAt !== undefined;
}

export interface CreateJobInput {
  organizationId: string;
  projectId: string;
  payload: Readonly<Record<string, unknown>>;
  idempotencyKey: string;
  priority?: number;
  maxAttempts?: number;
  backoffBaseSeconds?: number;
  scheduledAt?: string;
  /**
   * P09 canonical execution identity, written once into the `execution`
   * payload envelope. Raw payloads carrying an `execution` key without this
   * typed input are rejected (anti-forgery).
   */
  execution?: import("./execution-identity").ExecutionIdentityInput;
  /**
   * P09 queue-time governed dispatch envelope (`governance` key): the
   * ActionIntent plus admission facts established by the trusted queue-time
   * authority. Same anti-forgery rule as `execution`.
   */
  governance?: import("./execution-identity").GovernedDispatch;
}

export interface JobAccessScope {
  projectId: string;
}

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_STATUS_TRANSITIONS[from].includes(to);
}

export function calculateBackoffSeconds(
  baseSeconds: number,
  attemptNumber: number,
): number {
  const backoff = baseSeconds * Math.pow(2, attemptNumber - 1);
  return Math.min(Math.round(backoff), MAX_BACKOFF_SECONDS);
}

export function isJobTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function isJobActive(status: JobStatus): boolean {
  return status === "queued" || status === "claimed" || status === "running";
}
