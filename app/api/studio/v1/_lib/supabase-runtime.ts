import "server-only";

/**
 * STUDIO_05 route-adapter runtime access (apps/studio/app/api/studio/v1/_lib).
 * Supabase-backed RuntimeRepository over the j05 schema. Service-role
 * bypasses RLS, so every call binds explicit project scope. This is the
 * persistent binding the Studio factory requires in production.
 */
import { requireServiceClient, type ResolvedScope } from "./supabase-data";
import {
  RuntimeError,
  type AnchorJobInput,
  type DispatchOutboxEvent,
  type JobEvent,
  type LeaseClaim,
  type ProviderOperation,
  type ProviderOperationState,
  type RuntimeAttempt,
  type RuntimeGeneration,
  type RuntimeJob,
  type RuntimeRepository,
} from "@ethen/studio-core/server/runtime";
import type { JobStatus } from "@ethen/studio-core/contracts";
import { parseJobStatus } from "@ethen/studio-core/contracts";
import type { ProjectScope } from "@ethen/studio-core/contracts";
import { buildScope } from "@ethen/studio-core/contracts";
import type { TaskName } from "@ethen/studio-core/contracts";
import type { VersionPins } from "@ethen/studio-core/contracts";

type Row = Record<string, unknown>;

function str(row: Row, key: string): string {
  return String(row[key] ?? "");
}

function nullableStr(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function int(row: Row, key: string): number {
  const value = row[key];
  return typeof value === "number" ? value : Number(value ?? 0);
}

function bool(row: Row, key: string): boolean {
  return row[key] === true;
}

function obj(row: Row, key: string): Readonly<Record<string, unknown>> {
  const value = row[key];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function scopeOf(row: Row): ProjectScope {
  return buildScope(str(row, "tenant_id"), str(row, "workspace_id") || "default", str(row, "project_id"));
}

function toJob(row: Row): RuntimeJob {
  return {
    jobId: str(row, "job_id"),
    scope: scopeOf(row),
    task: str(row, "task_name") as TaskName,
    status: parseJobStatus(row["status"]),
    idempotencyKey: str(row, "idempotency_key"),
    requestHash: str(row, "request_hash"),
    quoteId: str(row, "quote_id"),
    reservationId: nullableStr(row, "reservation_id"),
    pins: obj(row, "pins") as unknown as VersionPins,
    endpointId: str(row, "endpoint_id"),
    parameters: obj(row, "parameters"),
    dispatchGeneration: int(row, "dispatch_generation"),
    leaseOwner: nullableStr(row, "lease_owner"),
    leaseExpiresAt: nullableStr(row, "lease_expires_at"),
    cancelReason: nullableStr(row, "cancel_reason"),
    legacyOrigin: nullableStr(row, "legacy_origin"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

function toOperation(row: Row): ProviderOperation {
  return {
    operationId: str(row, "operation_id"),
    jobId: str(row, "job_id"),
    attemptId: str(row, "attempt_id"),
    scope: scopeOf(row),
    operationKey: str(row, "operation_key"),
    providerOperationId: nullableStr(row, "provider_operation_id"),
    state: str(row, "state") as ProviderOperationState,
    redactedError: nullableStr(row, "redacted_error"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

function toAttempt(row: Row): RuntimeAttempt {
  return {
    attemptId: str(row, "attempt_id"),
    jobId: str(row, "job_id"),
    scope: scopeOf(row),
    attemptNumber: int(row, "attempt_number"),
    dispatchGeneration: int(row, "dispatch_generation"),
    operationKey: str(row, "operation_key"),
    phase: (str(row, "phase") || "dispatch") as RuntimeAttempt["phase"],
    status: parseJobStatus(row["status"]),
    providerOperationId: nullableStr(row, "provider_operation_id"),
    submitAmbiguous: bool(row, "submit_ambiguous"),
    lastError: nullableStr(row, "last_error"),
    createdAt: str(row, "created_at"),
    updatedAt: str(row, "updated_at"),
  };
}

function rpcError(error: { message: string }, fallback: string): RuntimeError {
  const message = error.message ?? fallback;
  if (message.includes("STUDIO_V5_ADMISSION_CONFLICT")) return new RuntimeError("ADMISSION_CONFLICT", message);
  if (message.includes("STUDIO_V5_ADMISSION_CLOSED")) return new RuntimeError("ADMISSION_CLOSED", message);
  if (message.includes("STUDIO_V5_STALE_WORKER")) return new RuntimeError("STALE_WORKER", message);
  if (message.includes("STUDIO_V5_LEASE_LOST")) return new RuntimeError("LEASE_LOST", message);
  if (message.includes("STUDIO_V5_AMBIGUOUS_SUBMIT")) return new RuntimeError("AMBIGUOUS_SUBMIT", message);
  if (message.includes("STUDIO_V5_INVALID_TRANSITION")) return new RuntimeError("INVALID_TRANSITION", message);
  if (message.includes("STUDIO_V5_NOT_FOUND")) return new RuntimeError("NOT_FOUND", message);
  return new RuntimeError("INTERNAL", message);
}

function firstRow(data: unknown): Row | null {
  if (Array.isArray(data)) return (data[0] as Row) ?? null;
  return (data as Row) ?? null;
}

/** Persistent Supabase RuntimeRepository — the production Studio binding. */
export class SupabaseRuntimeRepository implements RuntimeRepository {
  async anchor(input: AnchorJobInput): Promise<{ job: RuntimeJob; replayed: boolean }> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_jobs")
      .select("*")
      .eq("project_id", input.scope.projectId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    if (error) throw new RuntimeError("INTERNAL", `anchor lookup failed: ${error.message}`);
    if (data) {
      const job = toJob(data as Row);
      if (job.requestHash !== input.requestHash) {
        throw new RuntimeError("ADMISSION_CONFLICT", "idempotency key replayed with a different payload.");
      }
      return { job, replayed: true };
    }
    const { data: inserted, error: insertError } = await client
      .from("studio_v5_jobs")
      .insert({
        tenant_id: input.scope.tenantId,
        workspace_id: input.scope.workspaceId,
        project_id: input.scope.projectId,
        task_name: input.task,
        status: "QUEUED",
        idempotency_key: input.idempotencyKey,
        request_hash: input.requestHash,
        quote_id: input.quoteId,
        pins: input.pins,
        endpoint_id: input.endpointId,
        parameters: input.parameters,
      })
      .select("*")
      .single();
    if (insertError) {
      // Lost a race with a concurrent anchor: reselect the winner.
      if (insertError.message.includes("duplicate") || insertError.code === "23505") {
        return this.anchor(input);
      }
      throw new RuntimeError("INTERNAL", `anchor insert failed: ${insertError.message}`);
    }
    return { job: toJob(inserted as Row), replayed: false };
  }

  /** Atomic admission through the j05 SQL wrapper (preferred over anchor). */
  async admit(input: {
    scope: ResolvedScope;
    task: TaskName;
    actorId: string;
    idempotencyKey: string;
    requestHash: string;
    quoteId: string;
    pins: VersionPins;
    endpointId: string;
    parameters: Readonly<Record<string, unknown>>;
  }): Promise<{ jobId: string; reservationId: string; replayed: boolean; dispatchEventId: string }> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_admit_job", {
      p_tenant_id: input.scope.tenantId,
      p_workspace_id: input.scope.workspaceId,
      p_project_id: input.scope.projectId,
      p_task_name: input.task,
      p_actor_id: input.actorId,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: input.requestHash,
      p_quote_id: input.quoteId,
      p_pins: input.pins,
      p_endpoint_id: input.endpointId,
      p_parameters: input.parameters,
    });
    if (error) throw rpcError(error, "admission failed.");
    const row = firstRow(data);
    if (!row) throw new RuntimeError("INTERNAL", "admission returned no row.");
    return {
      jobId: str(row, "job_id"),
      reservationId: str(row, "reservation_id"),
      replayed: bool(row, "replayed"),
      dispatchEventId: str(row, "dispatch_event_id"),
    };
  }

  async get(jobId: string, scope: ProjectScope): Promise<RuntimeJob | null> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_get_job", {
      p_project_id: scope.projectId,
      p_job_id: jobId,
    });
    if (error) throw rpcError(error, "job lookup failed.");
    const row = firstRow(data);
    return row ? toJob(row) : null;
  }

  async getByIdempotency(scope: ProjectScope, key: string): Promise<RuntimeJob | null> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_jobs")
      .select("*")
      .eq("project_id", scope.projectId)
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) throw new RuntimeError("INTERNAL", `job lookup failed: ${error.message}`);
    return data ? toJob(data as Row) : null;
  }

  async bindReservation(jobId: string, scope: ProjectScope, reservationId: string): Promise<RuntimeJob> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_jobs")
      .update({ reservation_id: reservationId })
      .eq("project_id", scope.projectId)
      .eq("job_id", jobId)
      .select("*")
      .single();
    if (error) throw new RuntimeError("INTERNAL", `bind reservation failed: ${error.message}`);
    return toJob(data as Row);
  }

  async claimLease(scope: ProjectScope, workerId: string, leaseSeconds: number): Promise<LeaseClaim | null> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_claim_job", {
      p_project_id: scope.projectId,
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw rpcError(error, "lease claim failed.");
    const row = firstRow(data);
    if (!row) return null;
    const job = toJob(row);
    return { job, generation: job.dispatchGeneration };
  }

  async renewLease(): Promise<boolean> {
    // Renewals ride the worker heartbeat path (SQL lease update); the route
    // adapter never renews leases directly.
    throw new RuntimeError("INVALID_INPUT", "lease renewal is worker-only.");
  }

  async transition(
    jobId: string,
    scope: ProjectScope,
    workerId: string,
    generation: number,
    to: JobStatus,
  ): Promise<RuntimeJob> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_fenced_job_status", {
      p_project_id: scope.projectId,
      p_job_id: jobId,
      p_worker_id: workerId,
      p_generation: generation,
      p_status: to,
    });
    if (error) throw rpcError(error, "transition failed.");
    const row = firstRow(data);
    if (!row) throw new RuntimeError("NOT_FOUND", "job not found in this scope.");
    return toJob(row);
  }

  async forceTransition(jobId: string, scope: ProjectScope, to: JobStatus): Promise<RuntimeJob> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_force_job_status", {
      p_project_id: scope.projectId,
      p_job_id: jobId,
      p_status: to,
    });
    if (error) throw rpcError(error, "transition failed.");
    const row = firstRow(data);
    if (!row) throw new RuntimeError("NOT_FOUND", "job not found in this scope.");
    return toJob(row);
  }

  async startAttempt(
    jobId: string,
    scope: ProjectScope,
    workerId: string,
    generation: number,
  ): Promise<RuntimeAttempt> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_start_attempt", {
      p_project_id: scope.projectId,
      p_job_id: jobId,
      p_worker_id: workerId,
      p_generation: generation,
    });
    if (error) throw rpcError(error, "start attempt failed.");
    const row = firstRow(data);
    if (!row) throw new RuntimeError("NOT_FOUND", "attempt was not started.");
    return toAttempt(row);
  }

  async updateAttempt(): Promise<RuntimeAttempt> {
    throw new RuntimeError("INVALID_INPUT", "attempt patch is worker-only.");
  }

  async listAttempts(jobId: string, scope: ProjectScope): Promise<readonly RuntimeAttempt[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_attempts")
      .select("*")
      .eq("project_id", scope.projectId)
      .eq("job_id", jobId)
      .order("attempt_number", { ascending: true });
    if (error) throw new RuntimeError("INTERNAL", `attempt list failed: ${error.message}`);
    return ((data as Row[]) ?? []).map(toAttempt);
  }

  async markSubmitAmbiguous(attemptId: string, scope: ProjectScope, errorMsg: string): Promise<RuntimeAttempt> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_mark_attempt_ambiguous", {
      p_project_id: scope.projectId,
      p_attempt_id: attemptId,
      p_error: errorMsg,
    });
    if (error) throw rpcError(error, "mark ambiguous failed.");
    const row = firstRow(data);
    if (!row) throw new RuntimeError("NOT_FOUND", "attempt not found in this scope.");
    return toAttempt(row);
  }

  async publishOutbox(): Promise<DispatchOutboxEvent> {
    throw new RuntimeError("INVALID_INPUT", "outbox publish rides admission.");
  }

  async claimOutbox(): Promise<readonly DispatchOutboxEvent[]> {
    throw new RuntimeError("INVALID_INPUT", "outbox claim is bridge-only.");
  }

  async ackOutbox(): Promise<boolean> {
    throw new RuntimeError("INVALID_INPUT", "outbox ack is bridge-only.");
  }

  async deadLetterOutbox(): Promise<boolean> {
    throw new RuntimeError("INVALID_INPUT", "outbox dead-letter is bridge-only.");
  }

  async recordOperation(): Promise<ProviderOperation> {
    throw new RuntimeError("INVALID_INPUT", "operation record is worker-only.");
  }

  async updateOperation(): Promise<ProviderOperation> {
    throw new RuntimeError("INVALID_INPUT", "operation update is worker-only.");
  }

  async latestOperation(jobId: string, scope: ProjectScope): Promise<ProviderOperation | null> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_latest_operation", {
      p_project_id: scope.projectId,
      p_job_id: jobId,
    });
    if (error) throw rpcError(error, "latest operation failed.");
    const row = firstRow(data);
    return row ? toOperation(row) : null;
  }

  async linkGeneration(input: {
    jobId: string;
    attemptId: string;
    scope: ProjectScope;
    assetVersionIds: readonly string[];
    quarantined: boolean;
    quarantineReason: string | null;
  }): Promise<RuntimeGeneration> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_link_generation", {
      p_project_id: input.scope.projectId,
      p_job_id: input.jobId,
      p_attempt_id: input.attemptId,
      p_asset_version_ids: [...input.assetVersionIds],
      p_quarantined: input.quarantined,
      p_reason: input.quarantineReason,
    });
    if (error) throw rpcError(error, "link generation failed.");
    const row = firstRow(data);
    if (!row) throw new RuntimeError("NOT_FOUND", "generation was not linked.");
    const versions = row["asset_version_ids"];
    return {
      generationId: str(row, "generation_id"),
      jobId: str(row, "job_id"),
      attemptId: str(row, "attempt_id"),
      scope: input.scope,
      assetVersionIds: Array.isArray(versions) ? versions.filter((v): v is string => typeof v === "string") : [],
      quarantined: bool(row, "quarantined"),
      quarantineReason: nullableStr(row, "quarantine_reason"),
      createdAt: str(row, "created_at"),
    };
  }

  async recordEvent(input: {
    jobId: string;
    scope: ProjectScope;
    eventKey: string;
    type: string;
    payload: Readonly<Record<string, unknown>>;
  }): Promise<boolean> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_record_job_event", {
      p_project_id: input.scope.projectId,
      p_job_id: input.jobId,
      p_event_key: input.eventKey,
      p_type: input.type,
      p_payload: input.payload,
    });
    if (error) throw rpcError(error, "record event failed.");
    return data === true;
  }

  async listEvents(jobId: string, scope: ProjectScope): Promise<readonly JobEvent[]> {
    const client = requireServiceClient();
    const { data, error } = await client
      .from("studio_v5_job_events")
      .select("*")
      .eq("project_id", scope.projectId)
      .eq("job_id", jobId)
      .order("sequence", { ascending: true });
    if (error) throw new RuntimeError("INTERNAL", `event list failed: ${error.message}`);
    return ((data as Row[]) ?? []).map((row) => ({
      eventId: str(row, "event_id"),
      jobId: str(row, "job_id"),
      scope,
      eventKey: str(row, "event_key"),
      sequence: int(row, "sequence"),
      type: str(row, "type"),
      occurredAt: str(row, "occurred_at"),
      payload: obj(row, "payload"),
    }));
  }

  async requestCancel(jobId: string, scope: ProjectScope, reason: string): Promise<RuntimeJob> {
    const client = requireServiceClient();
    const { data, error } = await client.rpc("studio_v5_request_cancel", {
      p_project_id: scope.projectId,
      p_job_id: jobId,
      p_reason: reason,
    });
    if (error) throw rpcError(error, "cancel request failed.");
    const row = firstRow(data);
    if (!row) throw new RuntimeError("NOT_FOUND", "job not found in this scope.");
    return toJob(row);
  }

  async acknowledgeCancel(): Promise<boolean> {
    throw new RuntimeError("INVALID_INPUT", "cancel acknowledge is worker-only.");
  }

  async findReconciliationCandidates(): Promise<readonly RuntimeJob[]> {
    throw new RuntimeError("INVALID_INPUT", "reconciliation sweep is worker-only.");
  }

  async listJobs(projectId: string, status?: JobStatus, limit = 50): Promise<readonly RuntimeJob[]> {
    const client = requireServiceClient();
    let query = client
      .from("studio_v5_jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) throw new RuntimeError("INTERNAL", `job list failed: ${error.message}`);
    return ((data as Row[]) ?? []).map(toJob);
  }
}

export function buildScopeFromResolved(resolved: ResolvedScope): ProjectScope {
  return resolved.scope;
}

export type { ProviderOperationState };
