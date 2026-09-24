import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RunAttempt,
  RunContinuation,
  RunError,
  RunEvent,
  RunRecord,
  RunStatus,
} from "@ethen/contracts/platform/runs/contract";
import { normalizeRunReferences, normalizeWorkspaceExtension } from "@ethen/contracts/platform/runs/contract";
import { RunPersistenceError } from "./errors";
import type { AppendEventRecord, RunRepository } from "./repository";

type Row = Record<string, unknown>;

function message(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error);
}

function runFromRow(row: Row): RunRecord {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    projectId: String(row.project_id),
    actorId: String(row.actor_id),
    executionMode: row.execution_mode as RunRecord["executionMode"],
    workspace: row.workspace as RunRecord["workspace"],
    workspaceExtension: normalizeWorkspaceExtension(
      row.workspace_extension == null ||
        row.workspace_extension_version == null
        ? null
        : {
            name: row.workspace_extension as "founder" | "bot",
            version: row.workspace_extension_version as 1,
          },
    ),
    status: row.status as RunStatus,
    requestedModel: (row.requested_model as string | null) ?? null,
    resolvedModel: (row.resolved_model as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    traceId: String(row.trace_id),
    idempotencyKey: String(row.idempotency_key),
    parentRunId: (row.parent_run_id as string | null) ?? null,
    continuationOfRunId:
      (row.continuation_of_run_id as string | null) ?? null,
    policySnapshot: row.policy_snapshot as RunRecord["policySnapshot"],
    references: normalizeRunReferences(
      row.resource_references as Partial<RunRecord["references"]> | null,
    ),
    error: (row.error as RunError | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function runToRow(run: RunRecord): Row {
  return {
    id: run.id,
    organization_id: run.organizationId,
    project_id: run.projectId,
    actor_id: run.actorId,
    execution_mode: run.executionMode,
    workspace: run.workspace,
    workspace_extension: run.workspaceExtension?.name ?? null,
    workspace_extension_version: run.workspaceExtension?.version ?? null,
    status: run.status,
    requested_model: run.requestedModel,
    resolved_model: run.resolvedModel,
    provider: run.provider,
    trace_id: run.traceId,
    idempotency_key: run.idempotencyKey,
    parent_run_id: run.parentRunId,
    continuation_of_run_id: run.continuationOfRunId,
    policy_snapshot: run.policySnapshot,
    resource_references: run.references,
    error: run.error,
    created_at: run.createdAt,
    updated_at: run.updatedAt,
  };
}

function eventFromRow(row: Row): RunEvent {
  return {
    id: String(row.id),
    schemaVersion: 1,
    runId: String(row.run_id),
    projectId: String(row.project_id),
    sequence: Number(row.sequence),
    type: row.event_type as RunEvent["type"],
    visibility: row.visibility as RunEvent["visibility"],
    actorId: (row.actor_id as string | null) ?? null,
    attemptId: (row.attempt_id as string | null) ?? null,
    data: (row.data as Record<string, unknown> | null) ?? {},
    createdAt: String(row.created_at),
  };
}

function attemptFromRow(row: Row): RunAttempt {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    projectId: String(row.project_id),
    number: Number(row.attempt_number),
    kind: row.kind as RunAttempt["kind"],
    status: row.status as RunStatus,
    retryOfAttemptId: (row.retry_of_attempt_id as string | null) ?? null,
    contextSetId: (row.context_set_id as string | null) ?? null,
    error: (row.error as RunError | null) ?? null,
    createdAt: String(row.created_at),
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,
    outcomeId: (row.outcome_id as string | null) ?? null,
    judgmentId: (row.judgment_id as string | null) ?? null,
    humanInterventionId:
      (row.human_intervention_id as string | null) ?? null,
  };
}

function attemptToRow(attempt: RunAttempt): Row {
  return {
    id: attempt.id,
    run_id: attempt.runId,
    project_id: attempt.projectId,
    attempt_number: attempt.number,
    kind: attempt.kind,
    status: attempt.status,
    retry_of_attempt_id: attempt.retryOfAttemptId,
    context_set_id: attempt.contextSetId,
    error: attempt.error,
    created_at: attempt.createdAt,
    started_at: attempt.startedAt,
    ended_at: attempt.endedAt,
    outcome_id: attempt.outcomeId,
    judgment_id: attempt.judgmentId,
    human_intervention_id: attempt.humanInterventionId,
  };
}

function continuationFromRow(row: Row): RunContinuation {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    priorRunId: String(row.prior_run_id),
    nextRunId: String(row.next_run_id),
    fromAttemptId: (row.from_attempt_id as string | null) ?? null,
    reason: String(row.reason),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
  };
}

export class SupabaseRunRepository implements RunRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertRun(run: RunRecord): Promise<void> {
    const { error } = await this.client.from("runs").insert(runToRow(run));
    if (error) throw new RunPersistenceError("insert_run", message(error));
  }

  async findRun(projectId: string, runId: string): Promise<RunRecord | null> {
    const { data, error } = await this.client
      .from("runs")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", runId)
      .maybeSingle();
    if (error) throw new RunPersistenceError("find_run", message(error));
    return data ? runFromRow(data as Row) : null;
  }

  async updateRunStatus(input: {
    projectId: string;
    runId: string;
    expectedStatus: RunStatus;
    status: RunStatus;
    error: RunError | null;
    updatedAt: string;
  }): Promise<RunRecord> {
    const { data, error } = await this.client
      .from("runs")
      .update({
        status: input.status,
        error: input.error,
        updated_at: input.updatedAt,
      })
      .eq("project_id", input.projectId)
      .eq("id", input.runId)
      .eq("status", input.expectedStatus)
      .select("*")
      .maybeSingle();
    if (error) throw new RunPersistenceError("transition_run", message(error));
    if (!data) {
      throw new RunPersistenceError(
        "transition_run",
        "status compare-and-set conflict",
      );
    }
    return runFromRow(data as Row);
  }

  async appendEvent(event: AppendEventRecord): Promise<RunEvent> {
    const { data, error } = await this.client.rpc("append_run_event", {
      p_event_id: event.id,
      p_project_id: event.projectId,
      p_run_id: event.runId,
      p_schema_version: event.schemaVersion,
      p_event_type: event.type,
      p_visibility: event.visibility,
      p_actor_id: event.actorId,
      p_attempt_id: event.attemptId,
      p_data: event.data,
      p_created_at: event.createdAt,
    });
    if (error) throw new RunPersistenceError("append_event", message(error));
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new RunPersistenceError("append_event", "no row returned");
    return eventFromRow(row as Row);
  }

  async listEvents(projectId: string, runId: string): Promise<readonly RunEvent[]> {
    const { data, error } = await this.client
      .from("run_events")
      .select("*")
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .order("sequence", { ascending: true });
    if (error) throw new RunPersistenceError("list_events", message(error));
    return (data ?? []).map((row) => eventFromRow(row as Row));
  }

  async insertAttempt(attempt: RunAttempt): Promise<void> {
    const { error } = await this.client
      .from("run_attempts")
      .insert(attemptToRow(attempt));
    if (error) throw new RunPersistenceError("insert_attempt", message(error));
  }

  async updateAttempt(attempt: RunAttempt): Promise<void> {
    const { error } = await this.client
      .from("run_attempts")
      .update(attemptToRow(attempt))
      .eq("project_id", attempt.projectId)
      .eq("run_id", attempt.runId)
      .eq("id", attempt.id);
    if (error) throw new RunPersistenceError("update_attempt", message(error));
  }

  async listAttempts(projectId: string, runId: string): Promise<readonly RunAttempt[]> {
    const { data, error } = await this.client
      .from("run_attempts")
      .select("*")
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .order("attempt_number", { ascending: true });
    if (error) throw new RunPersistenceError("list_attempts", message(error));
    return (data ?? []).map((row) => attemptFromRow(row as Row));
  }

  async insertContinuation(continuation: RunContinuation): Promise<void> {
    const { error } = await this.client.from("run_continuations").insert({
      id: continuation.id,
      project_id: continuation.projectId,
      prior_run_id: continuation.priorRunId,
      next_run_id: continuation.nextRunId,
      from_attempt_id: continuation.fromAttemptId,
      reason: continuation.reason,
      created_by: continuation.createdBy,
      created_at: continuation.createdAt,
    });
    if (error) {
      throw new RunPersistenceError("insert_continuation", message(error));
    }
  }

  async listContinuations(
    projectId: string,
    runId: string,
  ): Promise<readonly RunContinuation[]> {
    const { data, error } = await this.client
      .from("run_continuations")
      .select("*")
      .eq("project_id", projectId)
      .or(`prior_run_id.eq.${runId},next_run_id.eq.${runId}`)
      .order("created_at", { ascending: true });
    if (error) {
      throw new RunPersistenceError("list_continuations", message(error));
    }
    return (data ?? []).map((row) => continuationFromRow(row as Row));
  }
}
