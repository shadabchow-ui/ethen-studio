import type {
  JobError,
  JobEvent,
  JobEventName,
  JobRecord,
  JobStatus,
} from "../../index";
import {
  calculateBackoffSeconds,
  DEFAULT_LEASE_DURATION_SECONDS,
  DEFAULT_QUEUE_NAME,
} from "../../index";
import { JobPersistenceError } from "../../index";
import type { FencingGeneration, JobClaimFilter, JobRepository, ReconcileDispatchedInput } from "./repository";

/**
 * P09 fencing check. An explicit generation must match the stored claim
 * generation exactly; an omitted generation keeps the legacy lease-owner
 * check (pre-P09 callers). The production worker path always supplies the
 * generation from its claim record, so stale claims are always rejected.
 */
function checkFencing(
  job: JobRecord,
  expectedGeneration: FencingGeneration,
): boolean {
  if (expectedGeneration === undefined) return true;
  return job.leaseGeneration === expectedGeneration;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function nowISO(): string {
  return new Date().toISOString();
}

export class InMemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly events = new Map<string, JobEvent[]>();
  private eventCounter = 0;

  private idempotencyKey(projectId: string, key: string): string {
    return `${projectId}:${key}`;
  }

  async createJob(job: JobRecord): Promise<JobRecord> {
    const key = this.idempotencyKey(job.projectId, job.idempotencyKey);
    if (this.idempotencyIndex.has(key)) {
      const existing = this.jobs.get(this.idempotencyIndex.get(key)!);
      if (existing) return copy(existing);
    }

    if (this.jobs.has(job.id)) {
      throw new JobPersistenceError("create_job", "job already exists");
    }

    const record = copy(job);
    this.jobs.set(job.id, record);
    this.idempotencyIndex.set(key, job.id);
    return copy(record);
  }

  async findJob(projectId: string, jobId: string): Promise<JobRecord | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.projectId !== projectId) return null;
    return copy(job);
  }

  async claimJob(filter: JobClaimFilter): Promise<JobRecord | null> {
    const workerId = filter.workerId;
    const leaseDuration = filter.leaseDurationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS;
    const queueName = filter.queueName ?? DEFAULT_QUEUE_NAME;
    const organizationId = filter.organizationId;
    const now = nowISO();

    // Find next eligible job
    const eligible = Array.from(this.jobs.values())
      .filter((j) => j.queueName === queueName)
      .filter((j) => !organizationId || j.organizationId === organizationId)
      .filter((j) => {
        if (j.status === "queued") return true;
        if (
          (j.status === "claimed" || j.status === "running") &&
          j.leaseExpiresAt &&
          j.leaseExpiresAt <= now
        )
          return true;
        return false;
      })
      .filter((j) => !j.scheduledAt || j.scheduledAt <= now)
      .filter((j) => !j.cancellationRequestedAt)
      .sort((a, b) => {
        // Priority descending, then scheduled_at ascending, then created_at ascending
        const prio = (b.priority ?? 0) - (a.priority ?? 0);
        if (prio !== 0) return prio;
        const sched = (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "");
        if (sched !== 0) return sched;
        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      });

    if (eligible.length === 0) return null;

    const job = eligible[0]!;
    const leaseExpiresAt = new Date(
      Date.now() + leaseDuration * 1000,
    ).toISOString();
    const attemptCount = job.attemptCount + 1;

    const updated: JobRecord = {
      ...job,
      status: "claimed",
      attemptCount,
      leaseId: workerId,
      leaseExpiresAt,
      claimedBy: workerId,
      // P09 fencing: every successful claim (including reclaim after lease
      // expiry) mints a strictly newer generation. Prior holders go stale.
      leaseGeneration: job.leaseGeneration + 1,
      updatedAt: nowISO(),
    };
    this.jobs.set(job.id, copy(updated));
    return copy(updated);
  }

  async renewLease(
    jobId: string,
    workerId: string,
    leaseDurationSeconds?: number,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;
    if (job.status !== "claimed" && job.status !== "running") return false;
    if (job.cancellationRequestedAt) return false;

    const duration = leaseDurationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS;
    const leaseExpiresAt = new Date(
      Date.now() + duration * 1000,
    ).toISOString();

    this.jobs.set(jobId, {
      ...job,
      ...(job.status === "claimed" ? { status: "running" } : {}),
      leaseExpiresAt,
      updatedAt: nowISO(),
    });
    return true;
  }

  async heartbeat(
    jobId: string,
    workerId: string,
    leaseDurationSeconds?: number,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    // Owner-only: a non-owning worker must never renew another's lease.
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;
    // Only claimed/running jobs can be heartbeated.
    if (job.status !== "claimed" && job.status !== "running") return false;
    if (job.cancellationRequestedAt) return false;

    const duration = leaseDurationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS;
    const leaseExpiresAt = new Date(
      Date.now() + duration * 1000,
    ).toISOString();

    this.jobs.set(jobId, {
      ...job,
      ...(job.status === "claimed" ? { status: "running" } : {}),
      leaseExpiresAt,
      updatedAt: nowISO(),
    });
    return true;
  }

  async markProviderDispatched(
    jobId: string,
    workerId: string,
    operationKey: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;
    if (job.status !== "claimed" && job.status !== "running") return false;
    if (job.cancellationRequestedAt) return false;

    this.jobs.set(jobId, {
      ...job,
      ...(job.status === "claimed" ? { status: "running" } : {}),
      providerDispatchStartedAt: nowISO(),
      providerOperationKey: operationKey,
      updatedAt: nowISO(),
    });
    return true;
  }

  async completeJob(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;
    if (job.status !== "claimed" && job.status !== "running") return false;

    this.jobs.set(jobId, {
      ...job,
      status: "completed",
      leaseId: null,
      leaseExpiresAt: null,
      claimedBy: null,
      updatedAt: nowISO(),
    });
    return true;
  }

  async failJob(
    jobId: string,
    workerId: string,
    error: JobError,
    retryable: boolean,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;

    const now = nowISO();

    // Job-02 rule (Compute `retrySafe:false` ported): once an external/provider
    // effect was dispatched (providerDispatchStartedAt set), a retryable error
    // is an UNCERTAIN outcome — NOT a clean retry, because the side effect may
    // already have fired and blind retry would double it. Land in INDETERMINATE;
    // only reconciliation on the stable dispatch marker may resolve it.
    if (retryable && job.providerDispatchStartedAt) {
      this.jobs.set(jobId, {
        ...job,
        status: "indeterminate",
        lastError: error,
        leaseId: null,
        leaseExpiresAt: null,
        claimedBy: null,
        updatedAt: now,
      });
      return true;
    }

    const nextAttempt = job.attemptCount;

    if (retryable && nextAttempt < job.maxAttempts) {
      const backoffSeconds = calculateBackoffSeconds(
        job.backoffBaseSeconds,
        nextAttempt,
      );
      const scheduledAt = new Date(
        Date.now() + backoffSeconds * 1000,
      ).toISOString();

      this.jobs.set(jobId, {
        ...job,
        status: "queued",
        lastError: error,
        leaseId: null,
        leaseExpiresAt: null,
        claimedBy: null,
        scheduledAt,
        updatedAt: now,
      });
    } else if (retryable && nextAttempt >= job.maxAttempts) {
      // Dead letter
      this.jobs.set(jobId, {
        ...job,
        status: "dead_letter",
        lastError: error,
        deadLetterAt: now,
        deadLetterReason: "max_attempts_exhausted",
        leaseId: null,
        leaseExpiresAt: null,
        claimedBy: null,
        updatedAt: now,
      });
    } else {
      // Non-retryable -> failed
      this.jobs.set(jobId, {
        ...job,
        status: "failed",
        lastError: error,
        leaseId: null,
        leaseExpiresAt: null,
        claimedBy: null,
        updatedAt: now,
      });
    }

    return true;
  }

  async markIndeterminate(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;
    if (job.status !== "claimed" && job.status !== "running") return false;
    if (!error || !error.code) return false;

    this.jobs.set(jobId, {
      ...job,
      status: "indeterminate",
      lastError: error,
      leaseId: null,
      leaseExpiresAt: null,
      claimedBy: null,
      updatedAt: nowISO(),
    });
    return true;
  }

  async markHaltUnsafe(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;
    if (job.status !== "claimed" && job.status !== "running") return false;
    if (!error || !error.code) return false;

    this.jobs.set(jobId, {
      ...job,
      status: "halt_unsafe",
      lastError: error,
      leaseId: null,
      leaseExpiresAt: null,
      claimedBy: null,
      updatedAt: nowISO(),
    });
    return true;
  }

  async markTimedOut(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.claimedBy !== workerId || !checkFencing(job, expectedGeneration) || (job.status !== "claimed" && job.status !== "running") || !error?.code) return false;
    this.jobs.set(jobId, { ...job, status: "timed_out", lastError: error, leaseId: null, leaseExpiresAt: null, claimedBy: null, updatedAt: nowISO() });
    return true;
  }

  async reconcileDispatched(
    jobId: string,
    workerId: string,
    input: ReconcileDispatchedInput,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    // P09 project guard: reconciliation can never cross tenant/project scope.
    if (input.projectId !== undefined && job.projectId !== input.projectId) return false;
    // Reconciliation is keyed on the STABLE DISPATCH MARKER, not on lease
    // ownership (an indeterminate job has already terminalized and released
    // its lease). Only a job that crossed the dispatch boundary may be
    // reconciled, and only from indeterminate (or, defensively, a claimed/
    // running dispatched job before it terminalizes).
    if (job.providerDispatchStartedAt === null) return false;
    if (job.status !== "indeterminate") {
      if (!(job.status === "claimed" || job.status === "running")) return false;
    }

    const now = nowISO();
    const base = {
      leaseId: null,
      leaseExpiresAt: null,
      claimedBy: null,
      updatedAt: now,
      lastReconciledAt: now,
      reconcileCount: job.reconcileCount + 1,
    };

    if (input.status === "completed") {
      this.jobs.set(jobId, { ...job, status: "completed", lastError: null, ...base });
    } else if (input.status === "dead_letter") {
      this.jobs.set(jobId, {
        ...job,
        status: "dead_letter",
        lastError: input.error ?? job.lastError,
        deadLetterAt: now,
        deadLetterReason: input.deadLetterReason ?? "reconciled_indeterminate",
        ...base,
      });
    } else {
      this.jobs.set(jobId, { ...job, status: "failed", lastError: input.error ?? job.lastError, ...base });
    }
    return true;
  }

  /**
   * P09 operator escalation overlay. Eligible from indeterminate or timed_out
   * only, project-scoped, and idempotent (already-escalated returns false).
   * The truthful status is preserved; uncertainty is surfaced, never
   * converted into a retryable failure.
   */
  async escalateForOperatorReview(
    jobId: string,
    projectId: string,
    reason: string,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.projectId !== projectId) return false;
    if (job.status !== "indeterminate" && job.status !== "timed_out") return false;
    if (job.escalatedAt !== null) return false;
    if (!reason.trim()) return false;
    this.jobs.set(jobId, {
      ...job,
      escalatedAt: nowISO(),
      escalationReason: reason,
      updatedAt: nowISO(),
    });
    return true;
  }

  /**
   * P09 deterministic sweep input, project-scoped: indeterminate or timed_out
   * (any age), plus claimed/running jobs whose lease has expired (crash /
   * reclaim candidates for inspection). Oldest first for determinism.
   */
  async findReconciliationCandidates(
    projectId: string,
    limit?: number,
  ): Promise<readonly JobRecord[]> {
    const now = nowISO();
    const results = Array.from(this.jobs.values())
      .filter((j) => j.projectId === projectId)
      .filter((j) => {
        if (j.status === "indeterminate" || j.status === "timed_out") return true;
        if (
          (j.status === "claimed" || j.status === "running") &&
          j.leaseExpiresAt &&
          j.leaseExpiresAt <= now
        ) {
          return true;
        }
        return false;
      })
      .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
    const capped = limit && limit > 0 ? results.slice(0, limit) : results;
    return capped.map((j) => copy(j));
  }

  async cancelJob(
    projectId: string,
    jobId: string,
    reason: string,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.projectId !== projectId) return false;
    if (
      job.status === "completed" ||
      job.status === "failed" ||
      job.status === "cancelled" ||
      job.status === "dead_letter" ||
      job.status === "indeterminate" ||
      job.status === "halt_unsafe" ||
      job.status === "timed_out"
    )
      return false;

    const now = nowISO();

    if (job.status === "claimed" || job.status === "running") {
      this.jobs.set(jobId, {
        ...job,
        cancellationRequestedAt: now,
        cancellationReason: reason,
        updatedAt: now,
      });
    } else {
      this.jobs.set(jobId, {
        ...job,
        status: "cancelled",
        cancellationRequestedAt: now,
        cancellationReason: reason,
        leaseId: null,
        leaseExpiresAt: null,
        claimedBy: null,
        updatedAt: now,
      });
    }

    return true;
  }

  async acknowledgeCancellation(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.claimedBy !== workerId) return false;
    if (!checkFencing(job, expectedGeneration)) return false;
    if (job.status !== "claimed" && job.status !== "running") return false;
    if (!job.cancellationRequestedAt) return false;

    this.jobs.set(jobId, {
      ...job,
      status: "cancelled",
      leaseId: null,
      leaseExpiresAt: null,
      claimedBy: null,
      updatedAt: nowISO(),
    });
    return true;
  }

  async isCancellationRequested(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    return (
      job.cancellationRequestedAt !== null &&
      (job.status === "claimed" || job.status === "running")
    );
  }

  async findByIdempotencyKey(
    projectId: string,
    idempotencyKey: string,
  ): Promise<JobRecord | null> {
    const key = this.idempotencyKey(projectId, idempotencyKey);
    const id = this.idempotencyIndex.get(key);
    if (!id) return null;
    const job = this.jobs.get(id);
    return job ? copy(job) : null;
  }

  async listJobs(
    projectId: string,
    status?: JobStatus,
    limit?: number,
  ): Promise<readonly JobRecord[]> {
    let results = Array.from(this.jobs.values())
      .filter((j) => j.projectId === projectId);
    if (status) {
      results = results.filter((j) => j.status === status);
    }
    results.sort(
      (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
    if (limit && limit > 0) {
      results = results.slice(0, limit);
    }
    return results.map((j) => copy(j));
  }

  async appendJobEvent(
    jobId: string,
    workerId: string | null,
    event: JobEventName,
    detail?: Readonly<Record<string, unknown>> | null,
  ): Promise<boolean> {
    if (!this.jobs.has(jobId)) return false;
    const trail = this.events.get(jobId) ?? [];
    this.eventCounter += 1;
    trail.push({
      id: `evt-${this.eventCounter}`,
      jobId,
      workerId,
      event,
      detail: detail ? { ...detail } : null,
      createdAt: nowISO(),
    });
    this.events.set(jobId, trail);
    return true;
  }

  async listJobEvents(jobId: string): Promise<readonly JobEvent[]> {
    const trail = this.events.get(jobId) ?? [];
    return trail.map((e) => ({ ...e, detail: e.detail ? { ...e.detail } : null }));
  }

  async retryJob(projectId: string, jobId: string, reason: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.projectId !== projectId) return false;
    // Only `failed` is operator-retryable. dead_letter stays terminal
    // (Job 02 canonical contract); indeterminate needs reconciliation.
    if (job.status !== "failed") return false;
    if (!reason.trim()) return false;

    this.jobs.set(jobId, {
      ...job,
      status: "queued",
      attemptCount: 0,
      scheduledAt: nowISO(),
      lastError: null,
      leaseId: null,
      leaseExpiresAt: null,
      claimedBy: null,
      updatedAt: nowISO(),
    });
    return true;
  }
}
