import { randomUUID } from "node:crypto";
import {
  canTransitionJob,
  DEFAULT_BACKOFF_BASE_SECONDS,
  DEFAULT_LEASE_DURATION_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_QUEUE_NAME,
  isJobTerminal,
  type CreateJobInput,
  type JobAccessScope,
  type JobError,
  type JobEvent,
  type JobEventName,
  type JobRecord,
  type JobStatus,
} from "../../index";
import { JobContractError } from "../../index";
import type { FencingGeneration, JobRepository, ReconcileDispatchedInput } from "./repository";
import {
  buildExecutionEnvelope,
  EXECUTION_ENVELOPE_KEY,
  GOVERNANCE_ENVELOPE_KEY,
} from "../../index";

interface JobServiceDependencies {
  repository: JobRepository;
  now?: () => string;
  newId?: () => string;
}

function requireText(value: string, field: string): void {
  if (!value.trim()) {
    throw new JobContractError("INVALID_INPUT", `${field} is required.`);
  }
}

export class DurableJobService {
  private readonly repository: JobRepository;
  private readonly now: () => string;
  private readonly newId: () => string;

  constructor(dependencies: JobServiceDependencies) {
    this.repository = dependencies.repository;
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.newId = dependencies.newId ?? randomUUID;
  }

  /**
   * Create a durable job with idempotency-key duplicate suppression.
   * Returns the existing job if one with the same idempotency key already exists.
   */
  async createJob(input: CreateJobInput): Promise<JobRecord> {
    for (const [field, value] of Object.entries({
      organizationId: input.organizationId,
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
    })) {
      requireText(value, field);
    }

    if (!input.payload || Object.keys(input.payload).length === 0) {
      throw new JobContractError(
        "INVALID_INPUT",
        "payload is required and must be non-empty.",
      );
    }

    // P09 anti-forgery: canonical `execution` / `governance` envelopes may
    // only be written through the typed creation inputs. A raw payload
    // carrying those keys without typed input is rejected — tenant, actor,
    // and governance bindings cannot be forged through untyped fields.
    if (
      EXECUTION_ENVELOPE_KEY in input.payload &&
      input.execution === undefined
    ) {
      throw new JobContractError(
        "INVALID_INPUT",
        "payload.execution is reserved for canonical execution identity; supply CreateJobInput.execution.",
      );
    }
    if (
      GOVERNANCE_ENVELOPE_KEY in input.payload &&
      input.governance === undefined
    ) {
      throw new JobContractError(
        "INVALID_INPUT",
        "payload.governance is reserved for governed dispatch; supply CreateJobInput.governance.",
      );
    }

    const now = this.now();
    const id = this.newId();
    const payload: Record<string, unknown> = { ...input.payload };
    if (input.execution !== undefined) {
      payload[EXECUTION_ENVELOPE_KEY] = buildExecutionEnvelope(
        input.execution,
        {
          id,
          organizationId: input.organizationId,
          projectId: input.projectId,
        },
      );
    }
    if (input.governance !== undefined) {
      payload[GOVERNANCE_ENVELOPE_KEY] = structuredClone(input.governance);
    }
    const job: JobRecord = {
      id,
      organizationId: input.organizationId,
      projectId: input.projectId,
      queueName: DEFAULT_QUEUE_NAME,
      payload,
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      attemptCount: 0,
      lastError: null,
      deadLetterAt: null,
      deadLetterReason: null,
      leaseId: null,
      leaseExpiresAt: null,
      claimedBy: null,
      leaseGeneration: 0,
      cancellationRequestedAt: null,
      cancellationReason: null,
      scheduledAt: input.scheduledAt ?? now,
      backoffBaseSeconds:
        input.backoffBaseSeconds ?? DEFAULT_BACKOFF_BASE_SECONDS,
      createdAt: now,
      updatedAt: now,
      providerDispatchStartedAt: null,
      providerOperationKey: null,
      escalatedAt: null,
      escalationReason: null,
      lastReconciledAt: null,
      reconcileCount: 0,
    };

    return this.repository.createJob(job);
  }

  /**
   * Atomically claim the next eligible job. Returns null if no job is available.
   * Optionally restricted to one organization (worker org scope).
   */
  async claimJob(
    workerId: string,
    leaseDurationSeconds: number = DEFAULT_LEASE_DURATION_SECONDS,
    organizationId?: string,
  ): Promise<JobRecord | null> {
    requireText(workerId, "workerId");

    return this.repository.claimJob({
      workerId,
      leaseDurationSeconds,
      queueName: DEFAULT_QUEUE_NAME,
      organizationId,
    });
  }

  /**
   * Renew the lease on a claimed/running job. Promotes claimed -> running.
   * Returns false if the worker does not own the lease or cancellation is requested.
   */
  async renewLease(
    jobId: string,
    workerId: string,
    leaseDurationSeconds: number = DEFAULT_LEASE_DURATION_SECONDS,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    return this.repository.renewLease(jobId, workerId, leaseDurationSeconds, expectedGeneration);
  }

  /**
   * Lease-owner-only heartbeat. Alias-friendly entry point for the worker
   * loop; refuses a non-owning worker (Job 02).
   */
  async heartbeat(
    jobId: string,
    workerId: string,
    leaseDurationSeconds: number = DEFAULT_LEASE_DURATION_SECONDS,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    return this.repository.heartbeat(jobId, workerId, leaseDurationSeconds, expectedGeneration);
  }

  /**
   * Record the stable external/provider dispatch boundary, marking that a
   * provider/external side effect has been dispatched. Owner-only.
   */
  async markProviderDispatched(
    jobId: string,
    workerId: string,
    operationKey: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireText(operationKey, "operationKey");
    return this.repository.markProviderDispatched(jobId, workerId, operationKey, expectedGeneration);
  }

  /**
   * Terminalize a claimed/running job as INDETERMINATE (post-dispatch
   * uncertain outcome). Owner-only. Resolves only via reconcileDispatchedJob().
   */
  async markIndeterminate(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    this.requireError(error);
    return this.repository.markIndeterminate(jobId, workerId, error, expectedGeneration);
  }

  /**
   * Terminalize a claimed/running job as HALT_UNSAFE. Owner-only. This state
   * never transitions onward.
   */
  async markHaltUnsafe(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    this.requireError(error);
    return this.repository.markHaltUnsafe(jobId, workerId, error, expectedGeneration);
  }

  async markTimedOut(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    this.requireError(error);
    return this.repository.markTimedOut(jobId, workerId, error, expectedGeneration);
  }

  /**
   * Resolve an INDETERMINATE/dispatched job to a concrete terminal state via
   * a proven stable reconciliation identity. The ONLY path out of INDETERMINATE.
   */
  async reconcileDispatchedJob(
    jobId: string,
    workerId: string,
    input: ReconcileDispatchedInput,
  ): Promise<boolean> {
    return this.repository.reconcileDispatched(jobId, workerId, input);
  }

  private requireError(error: JobError): void {
    if (!error || !error.code || !error.message) {
      throw new JobContractError(
        "INVALID_INPUT",
        "A terminal error code and message are required.",
      );
    }
  }

  /**
   * Mark a job as completed. Requires lease ownership.
   */
  async completeJob(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    return this.repository.completeJob(jobId, workerId, expectedGeneration);
  }

  /**
   * Fail a job. If retryable and attempts remain, schedules retry with backoff.
   * If retries exhausted, moves to dead_letter. If non-retryable, moves to failed.
   */
  async failJob(
    jobId: string,
    workerId: string,
    error: JobError,
    retryable: boolean,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    return this.repository.failJob(jobId, workerId, error, retryable, expectedGeneration);
  }

  /**
   * Cancel a job. Queued jobs transition immediately to cancelled.
   * Running/claimed jobs get a cancellation request flag that the worker must
   * acknowledge via acknowledgeCancellation().
   */
  async cancelJob(
    scope: JobAccessScope,
    jobId: string,
    reason: string,
  ): Promise<boolean> {
    requireText(reason, "reason");
    return this.repository.cancelJob(scope.projectId, jobId, reason);
  }

  /**
   * Acknowledge cancellation for a running/claimed job that has been flagged.
   * Transitions to cancelled terminal state.
   */
  async acknowledgeCancellation(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    return this.repository.acknowledgeCancellation(jobId, workerId, expectedGeneration);
  }

  /**
   * P09 operator escalation: durably surface a job whose outcome cannot be
   * safely auto-resolved. Project-scoped; eligible from indeterminate or
   * timed_out only; idempotent (already-escalated returns false).
   */
  async escalateForOperatorReview(
    scope: JobAccessScope,
    jobId: string,
    reason: string,
  ): Promise<boolean> {
    requireText(reason, "reason");
    return this.repository.escalateForOperatorReview(jobId, scope.projectId, reason);
  }

  /**
   * P09 deterministic sweep input, project-scoped. Never crosses
   * tenant/project scope.
   */
  async findReconciliationCandidates(
    scope: JobAccessScope,
    limit?: number,
  ): Promise<readonly JobRecord[]> {
    return this.repository.findReconciliationCandidates(scope.projectId, limit);
  }

  /**
   * Check if a job has a pending cancellation request.
   */
  async isCancellationRequested(jobId: string): Promise<boolean> {
    return this.repository.isCancellationRequested(jobId);
  }

  /**
   * Find a job by its idempotency key within a project.
   * Useful for verifying duplicate suppression from the caller side.
   */
  async findByIdempotencyKey(
    scope: JobAccessScope,
    idempotencyKey: string,
  ): Promise<JobRecord | null> {
    return this.repository.findByIdempotencyKey(
      scope.projectId,
      idempotencyKey,
    );
  }

  /**
   * List jobs in a project, optionally filtered by status.
   */
  async listJobs(
    scope: JobAccessScope,
    status?: JobStatus,
    limit?: number,
  ): Promise<readonly JobRecord[]> {
    return this.repository.listJobs(scope.projectId, status, limit);
  }

  /**
   * Get a single job by ID.
   */
  async getJob(
    scope: JobAccessScope,
    jobId: string,
  ): Promise<JobRecord | null> {
    return this.repository.findJob(scope.projectId, jobId);
  }

  /**
   * Append a durable lifecycle event to a job's trail (Job 04).
   */
  async appendJobEvent(
    jobId: string,
    workerId: string | null,
    event: JobEventName,
    detail?: Readonly<Record<string, unknown>> | null,
  ): Promise<boolean> {
    return this.repository.appendJobEvent(jobId, workerId, event, detail);
  }

  /**
   * Read a job's durable event trail, oldest first (Job 04).
   */
  async listJobEvents(jobId: string): Promise<readonly JobEvent[]> {
    return this.repository.listJobEvents(jobId);
  }

  /**
   * Operator retry of a `failed` job. Dead-lettered / indeterminate jobs are
   * NOT retryable here (indeterminate requires reconciliation; dead_letter is
   * terminal per the canonical contract).
   */
  async retryJob(
    scope: JobAccessScope,
    jobId: string,
    reason: string,
  ): Promise<boolean> {
    requireText(reason, "reason");
    return this.repository.retryJob(scope.projectId, jobId, reason);
  }
}
