import "server-only";

import type { JobError, JobEvent, JobEventName, JobRecord, JobStatus } from "../../index";
import { DEFAULT_LEASE_DURATION_SECONDS, DEFAULT_QUEUE_NAME } from "../../index";
import { JobPersistenceError } from "../../index";
import type { FencingGeneration, JobClaimFilter, JobRepository, ReconcileDispatchedInput } from "./repository";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isDurableJobProjectId(value: string): boolean {
  return UUID_RE.test(value);
}

export interface DurableJobsQuery {
  eq(column: string, value: string): DurableJobsQuery;
  order(column: string, options: { ascending: boolean }): DurableJobsQuery;
  limit(count: number): DurableJobsQuery;
  maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
  then: Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>["then"];
}

export interface DurableJobsClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): { select(columns: string): DurableJobsQuery };
}

function requireUuid(value: string, field: string): void {
  if (!isDurableJobProjectId(value)) {
    throw new JobPersistenceError(
      "invalid_id",
      `${field} must be a UUID to persist on durable_jobs.`,
    );
  }
}

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value);
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function mapDurableJobRow(row: Record<string, unknown>): JobRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    projectId: String(row.project_id),
    queueName: String(row.queue_name ?? DEFAULT_QUEUE_NAME),
    payload:
      row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : {},
    idempotencyKey: String(row.idempotency_key),
    status: row.status as JobStatus,
    priority: asNumber(row.priority, 0),
    maxAttempts: asNumber(row.max_attempts, 3),
    attemptCount: asNumber(row.attempt_count, 0),
    lastError: (row.last_error as JobError | null) ?? null,
    deadLetterAt: asIso(row.dead_letter_at),
    deadLetterReason: asString(row.dead_letter_reason),
    leaseId: asString(row.lease_id),
    leaseExpiresAt: asIso(row.lease_expires_at),
    claimedBy: asString(row.claimed_by),
    leaseGeneration: asNumber(row.lease_generation, 0),
    cancellationRequestedAt: asIso(row.cancellation_requested_at),
    cancellationReason: asString(row.cancellation_reason),
    scheduledAt: asIso(row.scheduled_at) ?? new Date(0).toISOString(),
    backoffBaseSeconds: asNumber(row.backoff_base_seconds, 30),
    createdAt: asIso(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: asIso(row.updated_at) ?? new Date(0).toISOString(),
    providerDispatchStartedAt: asIso(row.provider_dispatch_started_at),
    providerOperationKey: asString(row.provider_operation_key),
    escalatedAt: asIso(row.escalated_at),
    escalationReason: asString(row.escalation_reason),
    lastReconciledAt: asIso(row.last_reconciled_at),
    reconcileCount: asNumber(row.reconcile_count, 0),
  };
}

function unwrap<T>(result: { data: T; error: { message: string } | null }, operation: string): T {
  if (result.error) {
    throw new JobPersistenceError(operation, result.error.message);
  }
  return result.data;
}

export class SupabaseDurableJobRepository implements JobRepository {
  constructor(private readonly client: DurableJobsClient) {}

  async createJob(job: JobRecord): Promise<JobRecord> {
    requireUuid(job.projectId, "projectId");
    requireUuid(job.id, "id");
    const rows = unwrap(
      (await this.client.rpc("create_durable_job", {
        p_id: job.id,
        p_organization_id: job.organizationId,
        p_project_id: job.projectId,
        p_payload: job.payload,
        p_idempotency_key: job.idempotencyKey,
        p_priority: job.priority,
        p_max_attempts: job.maxAttempts,
        p_backoff_base_seconds: job.backoffBaseSeconds,
        p_scheduled_at: job.scheduledAt,
      })) as { data: Record<string, unknown>[] | Record<string, unknown> | null; error: { message: string } | null },
      "create_job",
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new JobPersistenceError("create_job", "create_durable_job returned no row");
    return mapDurableJobRow(row);
  }

  async findJob(projectId: string, jobId: string): Promise<JobRecord | null> {
    if (!isDurableJobProjectId(projectId) || !isDurableJobProjectId(jobId)) return null;
    const row = unwrap(
      await this.client
        .from("durable_jobs")
        .select("*")
        .eq("project_id", projectId)
        .eq("id", jobId)
        .maybeSingle(),
      "find_job",
    );
    return row ? mapDurableJobRow(row) : null;
  }

  async claimJob(filter: JobClaimFilter): Promise<JobRecord | null> {
    const rows = unwrap(
      (await this.client.rpc("claim_durable_job_atomic", {
        p_worker_id: filter.workerId,
        p_lease_duration_seconds: filter.leaseDurationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS,
        p_queue_name: filter.queueName ?? DEFAULT_QUEUE_NAME,
        p_organization_id: filter.organizationId ?? null,
      })) as { data: Record<string, unknown>[] | Record<string, unknown> | null; error: { message: string } | null },
      "claim_job",
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? mapDurableJobRow(row) : null;
  }

  async renewLease(
    jobId: string,
    workerId: string,
    leaseDurationSeconds?: number,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("renew_job_lease", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_lease_duration_seconds: leaseDurationSeconds ?? DEFAULT_LEASE_DURATION_SECONDS,
          p_expected_generation: expectedGeneration ?? null,
        }),
        "renew_lease",
      ),
    );
  }

  async heartbeat(
    jobId: string,
    workerId: string,
    leaseDurationSeconds?: number,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    // Lease-owner-only heartbeat reuses the lease-renewal RPC, which already
    // enforces owner + claimed/running + no pending cancellation.
    return this.renewLease(jobId, workerId, leaseDurationSeconds, expectedGeneration);
  }

  async markProviderDispatched(
    jobId: string,
    workerId: string,
    operationKey: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("mark_job_dispatched", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_operation_key: operationKey,
          p_expected_generation: expectedGeneration ?? null,
        }),
        "mark_dispatched",
      ),
    );
  }

  async markIndeterminate(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("transition_job_to_indeterminate", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_error: error,
          p_expected_generation: expectedGeneration ?? null,
        }),
        "mark_indeterminate",
      ),
    );
  }

  async markHaltUnsafe(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("transition_job_to_halt_unsafe", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_error: error,
          p_expected_generation: expectedGeneration ?? null,
        }),
        "mark_halt_unsafe",
      ),
    );
  }

  async markTimedOut(
    jobId: string,
    workerId: string,
    error: JobError,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(unwrap(await this.client.rpc("transition_job_to_timed_out", { p_job_id: jobId, p_worker_id: workerId, p_error: error, p_expected_generation: expectedGeneration ?? null }), "mark_timed_out"));
  }

  async reconcileDispatched(
    jobId: string,
    workerId: string,
    input: ReconcileDispatchedInput,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("reconcile_dispatched_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_resolved_status: input.status,
          p_error: input.error ?? null,
          p_dead_letter_reason: input.deadLetterReason ?? null,
          p_project_id: input.projectId ?? null,
        }),
        "reconcile_dispatched",
      ),
    );
  }

  async escalateForOperatorReview(
    jobId: string,
    projectId: string,
    reason: string,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    requireUuid(projectId, "projectId");
    return Boolean(
      unwrap(
        await this.client.rpc("escalate_job_for_review", {
          p_job_id: jobId,
          p_project_id: projectId,
          p_reason: reason,
        }),
        "escalate_job",
      ),
    );
  }

  async findReconciliationCandidates(
    projectId: string,
    limit?: number,
  ): Promise<readonly JobRecord[]> {
    if (!isDurableJobProjectId(projectId)) return [];
    const rows = unwrap(
      (await this.client.rpc("list_reconciliation_candidates", {
        p_project_id: projectId,
        p_limit: limit ?? 50,
      })) as { data: Record<string, unknown>[] | null; error: { message: string } | null },
      "list_reconciliation_candidates",
    );
    return (rows ?? []).map(mapDurableJobRow);
  }

  async completeJob(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("complete_durable_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_expected_generation: expectedGeneration ?? null,
        }),
        "complete_job",
      ),
    );
  }

  async failJob(
    jobId: string,
    workerId: string,
    error: JobError,
    retryable: boolean,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("fail_durable_job", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_error: error,
          p_retryable: retryable,
          p_expected_generation: expectedGeneration ?? null,
        }),
        "fail_job",
      ),
    );
  }

  async cancelJob(projectId: string, jobId: string, reason: string): Promise<boolean> {
    requireUuid(projectId, "projectId");
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("cancel_durable_job", {
          p_job_id: jobId,
          p_project_id: projectId,
          p_reason: reason,
        }),
        "cancel_job",
      ),
    );
  }

  async acknowledgeCancellation(
    jobId: string,
    workerId: string,
    expectedGeneration?: FencingGeneration,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("acknowledge_job_cancellation", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_expected_generation: expectedGeneration ?? null,
        }),
        "acknowledge_cancellation",
      ),
    );
  }

  async isCancellationRequested(jobId: string): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("is_job_cancellation_requested", { p_job_id: jobId }),
        "is_cancellation_requested",
      ),
    );
  }

  async findByIdempotencyKey(
    projectId: string,
    idempotencyKey: string,
  ): Promise<JobRecord | null> {
    if (!isDurableJobProjectId(projectId)) return null;
    const rows = unwrap(
      (await this.client.rpc("find_job_by_idempotency_key", {
        p_project_id: projectId,
        p_idempotency_key: idempotencyKey,
      })) as { data: Record<string, unknown>[] | Record<string, unknown> | null; error: { message: string } | null },
      "find_by_idempotency",
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row ? mapDurableJobRow(row) : null;
  }

  async listJobs(
    projectId: string,
    status?: JobStatus,
    limit?: number,
  ): Promise<readonly JobRecord[]> {
    if (!isDurableJobProjectId(projectId)) return [];
    const query = this.client.from("durable_jobs").select("*").eq("project_id", projectId);
    const result = status
      ? await query.eq("status", status).order("created_at", { ascending: false }).limit(limit ?? 50)
      : await query.order("created_at", { ascending: false }).limit(limit ?? 50);
    const rows = unwrap(result, "list_jobs") ?? [];
    return rows.map(mapDurableJobRow);
  }

  async appendJobEvent(
    jobId: string,
    workerId: string | null,
    event: JobEventName,
    detail?: Readonly<Record<string, unknown>> | null,
  ): Promise<boolean> {
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("append_durable_job_event", {
          p_job_id: jobId,
          p_worker_id: workerId,
          p_event: event,
          p_detail: detail ?? null,
        }),
        "append_job_event",
      ),
    );
  }

  async listJobEvents(jobId: string): Promise<readonly JobEvent[]> {
    if (!isDurableJobProjectId(jobId)) return [];
    const rows = unwrap(
      (await this.client.rpc("list_durable_job_events", { p_job_id: jobId })) as {
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      },
      "list_job_events",
    );
    return (rows ?? []).map((row) => ({
      id: String(row.id),
      jobId: String(row.job_id),
      workerId: asString(row.worker_id),
      event: String(row.event) as JobEventName,
      detail: (row.detail as Record<string, unknown> | null) ?? null,
      createdAt: asIso(row.created_at) ?? new Date(0).toISOString(),
    }));
  }

  async retryJob(projectId: string, jobId: string, reason: string): Promise<boolean> {
    requireUuid(projectId, "projectId");
    requireUuid(jobId, "jobId");
    return Boolean(
      unwrap(
        await this.client.rpc("retry_durable_job", {
          p_job_id: jobId,
          p_project_id: projectId,
          p_reason: reason,
        }),
        "retry_job",
      ),
    );
  }
}
