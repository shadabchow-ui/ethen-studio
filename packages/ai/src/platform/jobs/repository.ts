import type { JobError, JobEvent, JobEventName, JobRecord, JobStatus } from "../../index";

export interface JobClaimFilter {
  workerId: string;
  leaseDurationSeconds?: number;
  queueName?: string;
  /** Restrict claiming to one organization (worker org scope). */
  organizationId?: string;
}

/** Resolved terminal state produced by reconciliation of a dispatched job. */
export type ReconcileTarget =
  | "completed"
  | "failed"
  | "dead_letter";

export interface ReconcileDispatchedInput {
  status: ReconcileTarget;
  error?: JobError;
  deadLetterReason?: string;
  /**
   * P09 project scope guard: when supplied, reconciliation is refused unless
   * the job belongs to this project. The deterministic sweeper always
   * supplies it, so reconciliation can never cross tenant/project scope.
   */
  projectId?: string;
}

/**
 * P09 fencing: the generation from the caller's claim record. When defined,
 * the mutation is applied only when the stored `leaseGeneration` matches
 * exactly — a stale (expired/reclaimed) worker is rejected. When undefined,
 * the legacy lease-owner check applies (pre-P09 callers). The production
 * worker path always supplies the generation from its claim record.
 */
export type FencingGeneration = number | undefined;

export interface JobRepository {
  createJob(job: JobRecord): Promise<JobRecord>;

  findJob(projectId: string, jobId: string): Promise<JobRecord | null>;

  claimJob(filter: JobClaimFilter): Promise<JobRecord | null>;

  renewLease(
    jobId: string,
    workerId: string,
    leaseDurationSeconds?: number,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  /**
   * Lease-owner-only heartbeat: renews the lease and promotes claimed ->
   * running. Returns false when the caller does not own the lease, the job
   * is not claimed/running, or cancellation is pending.
   */
  heartbeat(
    jobId: string,
    workerId: string,
    leaseDurationSeconds?: number,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  /**
   * Record the stable external/provider dispatch boundary. Sets
   * provider_dispatch_started_at (now) + the reconciliation operation key,
   * and promotes claimed -> running. Owner-only.
   */
  markProviderDispatched(
    jobId: string,
    workerId: string,
    operationKey: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  completeJob(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  failJob(
    jobId: string,
    workerId: string,
    error: JobError,
    retryable: boolean,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  /**
   * Terminalize as INDETERMINATE (post-dispatch uncertain outcome).
   * Owner-only, from claimed/running. Requires an error record.
   */
  markIndeterminate(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  /**
   * Terminalize as HALT_UNSAFE. Owner-only, from claimed/running. This state
   * never transitions onward.
   */
  markHaltUnsafe(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  /** Terminal timeout after a bounded worker execution. */
  markTimedOut(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  /**
   * Resolve an INDETERMINATE (or dispatched) job to a concrete terminal state
   * using a proven stable reconciliation identity/marker. This is the ONLY
   * path OUT of indeterminate.
   */
  reconcileDispatched(
    jobId: string,
    workerId: string,
    input: ReconcileDispatchedInput,
  ): Promise<boolean>;

  /**
   * P09 operator escalation: durably mark a job as needing an operator while
   * keeping its truthful status (indeterminate / timed_out). Eligible from
   * indeterminate or timed_out only, and only when not already escalated
   * (idempotent no-op returns false). Project-scoped: refuses cross-project
   * escalation.
   */
  escalateForOperatorReview(
    jobId: string,
    projectId: string,
    reason: string,
  ): Promise<boolean>;

  /**
   * P09 deterministic sweep input: jobs needing recovery attention within
   * one project — indeterminate or timed_out (any age), or claimed/running
   * with an expired lease. Never crosses project scope. Ordered oldest first
   * for deterministic processing.
   */
  findReconciliationCandidates(
    projectId: string,
    limit?: number,
  ): Promise<readonly JobRecord[]>;

  cancelJob(projectId: string, jobId: string, reason: string): Promise<boolean>;

  acknowledgeCancellation(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean>;

  isCancellationRequested(jobId: string): Promise<boolean>;

  findByIdempotencyKey(
    projectId: string,
    idempotencyKey: string,
  ): Promise<JobRecord | null>;

  listJobs(
    projectId: string,
    status?: JobStatus,
    limit?: number,
  ): Promise<readonly JobRecord[]>;

  /** Append a durable lifecycle event to a job's trail (Job 04). */
  appendJobEvent(
    jobId: string,
    workerId: string | null,
    event: JobEventName,
    detail?: Readonly<Record<string, unknown>> | null,
  ): Promise<boolean>;

  /** Read a job's durable event trail, oldest first. */
  listJobEvents(jobId: string): Promise<readonly JobEvent[]>;

  /**
   * Operator retry: re-enqueue a `failed` job (resets attempt count, clears
   * terminal evidence). Dead-lettered / indeterminate jobs are NOT retryable
   * here — indeterminate requires reconciliation, dead_letter stays terminal.
   */
  retryJob(projectId: string, jobId: string, reason: string): Promise<boolean>;
}
