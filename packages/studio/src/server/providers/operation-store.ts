/**
 * Studio V5 providers — durable operation store port (STUDIO M4). Server-only.
 *
 * Queue-lifecycle custody that survives worker restarts: the worker resumes
 * from the stored row (request id, poll URLs, attempts, cancel state), never
 * from adapter memory. Two implementations: a Supabase store over
 * studio_v5_provider_operations (production) and an in-memory store that is
 * test/fixture-only. No fake rows: reads return null when nothing persisted.
 */
import "server-only";

import type { ProviderOperationState } from "../ports/provider-adapter";

export type ProviderCancelState = "requested" | "confirmed" | "not_cancellable";

export interface ProviderOperationRecord {
  key: string;
  operationId: string;
  jobId: string | null;
  attemptId: string | null;
  endpointId: string | null;
  task: string | null;
  state: ProviderOperationState;
  requestId: string | null;
  statusUrl: string | null;
  responseUrl: string | null;
  attempts: number;
  lastPolledAt: string | null;
  cancelState: ProviderCancelState | null;
  redactedError: string | null;
  startedAt: string;
  updatedAt: string;
  [extra: string]: unknown;
}

export type ProviderOperationPatch = Partial<
  Pick<
    ProviderOperationRecord,
    | "state"
    | "task"
    | "requestId"
    | "statusUrl"
    | "responseUrl"
    | "endpointId"
    | "attempts"
    | "lastPolledAt"
    | "cancelState"
    | "redactedError"
    | "jobId"
    | "attemptId"
  >
>;

/** Durable operation custody. `put` inserts; replay checks read first. */
export interface ProviderOperationStore {
  getByKey(key: string): Promise<ProviderOperationRecord | null>;
  getByOperationId(operationId: string): Promise<ProviderOperationRecord | null>;
  put(record: ProviderOperationRecord): Promise<void>;
  update(operationId: string, patch: ProviderOperationPatch): Promise<ProviderOperationRecord | null>;
}

function clone(record: ProviderOperationRecord): ProviderOperationRecord {
  return { ...record };
}

/** In-memory store. Test/fixture-only: never production custody. */
export function createMemoryOperationStore(): ProviderOperationStore {
  const byKey = new Map<string, ProviderOperationRecord>();
  const byId = new Map<string, ProviderOperationRecord>();
  return {
    async getByKey(key: string): Promise<ProviderOperationRecord | null> {
      const found = byKey.get(key);
      return found ? clone(found) : null;
    },
    async getByOperationId(operationId: string): Promise<ProviderOperationRecord | null> {
      const found = byId.get(operationId);
      return found ? clone(found) : null;
    },
    async put(record: ProviderOperationRecord): Promise<void> {
      const copy = clone(record);
      byKey.set(copy.key, copy);
      byId.set(copy.operationId, copy);
    },
    async update(operationId: string, patch: ProviderOperationPatch): Promise<ProviderOperationRecord | null> {
      const found = byId.get(operationId);
      if (!found) return null;
      const next: ProviderOperationRecord = { ...found, ...patch, updatedAt: new Date().toISOString() };
      byId.set(operationId, next);
      byKey.set(next.key, next);
      return clone(next);
    },
  };
}

export interface OperationStoreQuery {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rowToRecord(row: Record<string, unknown>): ProviderOperationRecord {
  const cancel = str(row.cancel_state);
  return {
    key: String(row.operation_key ?? ""),
    operationId: String(row.provider_operation_id ?? ""),
    jobId: str(row.job_id),
    attemptId: str(row.attempt_id),
    endpointId: str(row.endpoint_id),
    task: str(row.task_name),
    state: (str(row.state) ?? "UNKNOWN") as ProviderOperationState,
    requestId: str(row.request_id),
    statusUrl: str(row.status_url),
    responseUrl: str(row.response_url),
    attempts: typeof row.attempts === "number" ? row.attempts : Number(row.attempts ?? 0),
    lastPolledAt: str(row.last_polled_at),
    cancelState: cancel === "requested" || cancel === "confirmed" || cancel === "not_cancellable" ? cancel : null,
    redactedError: str(row.redacted_error),
    startedAt: str(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: str(row.updated_at) ?? new Date(0).toISOString(),
  };
}

/**
 * Supabase/Postgres store over studio_v5_provider_operations (M4 columns).
 * Reads return the latest row for a key; `put` inserts (the adapter replays
 * by key before submitting, so inserts never duplicate a live operation).
 */
export function createSupabaseOperationStore(db: OperationStoreQuery): ProviderOperationStore {
  return {
    async getByKey(key: string): Promise<ProviderOperationRecord | null> {
      const result = await db.query(
        "select * from public.studio_v5_provider_operations where operation_key = $1 order by created_at desc limit 1",
        [key],
      );
      const row = result.rows[0];
      return row ? rowToRecord(row) : null;
    },
    async getByOperationId(operationId: string): Promise<ProviderOperationRecord | null> {
      const result = await db.query(
        "select * from public.studio_v5_provider_operations where provider_operation_id = $1 order by created_at desc limit 1",
        [operationId],
      );
      const row = result.rows[0];
      return row ? rowToRecord(row) : null;
    },
    async put(record: ProviderOperationRecord): Promise<void> {
      if (!record.jobId || !record.attemptId) {
        throw new Error("STUDIO_OPERATION_STORE_INVALID: durable put requires jobId and attemptId.");
      }
      await db.query(
        `insert into public.studio_v5_provider_operations
           (job_id, attempt_id, tenant_id, project_id, operation_key, provider_operation_id,
            state, redacted_error, request_id, status_url, response_url, endpoint_id,
            task_name, attempts, last_polled_at, cancel_state)
         values (
           (select job_id from public.studio_v5_jobs where job_id = $1),
           $2,
           (select tenant_id from public.studio_v5_jobs where job_id = $1),
           (select project_id from public.studio_v5_jobs where job_id = $1),
           $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
         )`,
        [
          record.jobId,
          record.attemptId,
          record.key,
          record.operationId,
          record.state,
          record.redactedError,
          record.requestId,
          record.statusUrl,
          record.responseUrl,
          record.endpointId,
          record.task,
          record.attempts,
          record.lastPolledAt,
          record.cancelState,
        ],
      );
    },
    async update(operationId: string, patch: ProviderOperationPatch): Promise<ProviderOperationRecord | null> {
      const result = await db.query(
        `update public.studio_v5_provider_operations set
           state = coalesce($2, state),
           request_id = coalesce($3, request_id),
           status_url = coalesce($4, status_url),
           response_url = coalesce($5, response_url),
           endpoint_id = coalesce($6, endpoint_id),
           attempts = coalesce($7, attempts),
           last_polled_at = coalesce($8, last_polled_at),
           cancel_state = coalesce($9, cancel_state),
           redacted_error = coalesce($10, redacted_error),
           updated_at = now()
         where provider_operation_id = $1
         returning *`,
        [
          operationId,
          patch.state ?? null,
          patch.requestId ?? null,
          patch.statusUrl ?? null,
          patch.responseUrl ?? null,
          patch.endpointId ?? null,
          patch.attempts ?? null,
          patch.lastPolledAt ?? null,
          patch.cancelState ?? null,
          patch.redactedError ?? null,
        ],
      );
      const row = result.rows[0];
      return row ? rowToRecord(row) : null;
    },
  };
}
