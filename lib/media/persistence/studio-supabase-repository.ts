import "server-only";

import { createServiceClient } from "@ethen/database/service";
import { assertStudioScope, sanitizeRecordPayload, type StudioEventReceipt, type StudioGraphEvent, type StudioIdempotentTable, type StudioPersistenceRecord, type StudioPersistenceScope, type StudioRecordTable, type StudioRepository, type StudioRevisionedTable, type StudioSystemTable } from "./studio-repository";

const scopeColumns = (scope: StudioPersistenceScope) => ({ organization_id: scope.organizationId, project_id: scope.projectId, actor_id: scope.actorId });

/** Production-only adapter. Service-role bypasses RLS, so every query binds organization and project. */
export class SupabaseStudioRepository implements StudioRepository {
  private client() { const client = createServiceClient(); if (!client) throw new Error("Studio production persistence requires a configured service client."); return client; }
  async insert(scope: StudioPersistenceScope, table: StudioRecordTable, record: Omit<StudioPersistenceRecord, "table" | "scope">): Promise<void> {
    assertStudioScope(scope);
    // Payloads must never overwrite identity/scope/system columns.
    const { error } = await this.client().from(table).insert({ id: record.id, ...scopeColumns(scope), ...sanitizeRecordPayload(record.payload), created_at: record.createdAt, updated_at: record.updatedAt, deleted_at: record.deletedAt });
    if (error) throw new Error(`Failed to persist Studio record: ${error.message}`);
  }
  async get(scope: StudioPersistenceScope, table: StudioRecordTable, id: string): Promise<StudioPersistenceRecord | null> {
    assertStudioScope(scope);
    const { data, error } = await this.client().from(table).select("*").eq("id", id).eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Failed to load Studio record: ${error.message}`);
    return data ? { id: String(data.id), table, scope, payload: data as Record<string, unknown>, createdAt: String(data.created_at), updatedAt: data.updated_at ? String(data.updated_at) : null, deletedAt: data.deleted_at ? String(data.deleted_at) : null } : null;
  }
  async list(scope: StudioPersistenceScope, table: StudioRecordTable): Promise<readonly StudioPersistenceRecord[]> {
    assertStudioScope(scope);
    const { data, error } = await this.client().from(table).select("*").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).is("deleted_at", null);
    if (error) throw new Error(`Failed to list Studio records: ${error.message}`);
    return (data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.id), table, scope, payload: row, createdAt: String(row.created_at), updatedAt: row.updated_at ? String(row.updated_at) : null, deletedAt: row.deleted_at ? String(row.deleted_at) : null }));
  }
  async softDelete(scope: StudioPersistenceScope, table: StudioRecordTable, id: string): Promise<boolean> {
    assertStudioScope(scope);
    const { data, error } = await this.client().from(table).update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw new Error(`Failed to delete Studio record: ${error.message}`); return Boolean(data);
  }
  async findByIdempotency(scope: StudioPersistenceScope, table: StudioIdempotentTable, idempotencyKey: string): Promise<StudioPersistenceRecord | null> {
    assertStudioScope(scope);
    const { data, error } = await this.client().from(table).select("*").eq("organization_id", scope.organizationId).eq("project_id", scope.projectId).eq("idempotency_key", idempotencyKey).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Failed to find Studio record by idempotency key: ${error.message}`);
    return data ? { id: String((data as Record<string, unknown>).id), table, scope, payload: data as Record<string, unknown>, createdAt: String((data as Record<string, unknown>).created_at), updatedAt: (data as Record<string, unknown>).updated_at ? String((data as Record<string, unknown>).updated_at) : null, deletedAt: null } : null;
  }
  async updateIfRevision(scope: StudioPersistenceScope, table: StudioRevisionedTable, id: string, expectedRevision: number, patch: Readonly<Record<string, unknown>>): Promise<StudioPersistenceRecord> {
    assertStudioScope(scope);
    // Single conditional UPDATE: the revision predicate makes this an atomic compare-and-swap.
    const { data, error } = await this.client().from(table)
      .update({ ...sanitizeRecordPayload(patch), revision: expectedRevision + 1, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", scope.organizationId).eq("project_id", scope.projectId)
      .eq("revision", expectedRevision).is("deleted_at", null)
      .select("*").maybeSingle();
    if (error) throw new Error(`Failed to update Studio record: ${error.message}`);
    if (data) {
      const row = data as Record<string, unknown>;
      return { id: String(row.id), table, scope, payload: row, createdAt: String(row.created_at), updatedAt: row.updated_at ? String(row.updated_at) : null, deletedAt: null };
    }
    const current = await this.get(scope, table, id);
    if (!current) throw new Error("STUDIO_NOT_FOUND: no live record for optimistic update.");
    throw new Error(`STUDIO_REVISION_CONFLICT: expected ${expectedRevision}, record has moved.`);
  }
  async appendEvent(scope: StudioPersistenceScope, event: Omit<StudioGraphEvent, "id" | "scope">): Promise<StudioEventReceipt> {
    assertStudioScope(scope);
    if (!event.entityKind?.trim() || !event.entityId?.trim() || !event.type?.trim() || !event.target?.trim()) {
      throw new Error("STUDIO_EVENT_REQUIRED: entityKind, entityId, type and target are required.");
    }
    if (!Number.isInteger(event.revision) || event.revision <= 0) throw new Error("STUDIO_EVENT_REQUIRED: positive revision is required.");
    // One RPC transaction inserts the event row and its outbox row atomically.
    const { data, error } = await this.client().rpc("studio_append_event", {
      p_organization_id: scope.organizationId, p_project_id: scope.projectId, p_actor_id: scope.actorId,
      p_entity_kind: event.entityKind, p_entity_id: event.entityId, p_revision: event.revision,
      p_type: event.type, p_payload: sanitizeRecordPayload(event.payload), p_target: event.target,
    });
    if (error) throw new Error(`Failed to append Studio event: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    return { eventId: String(row?.event_id ?? ""), seq: typeof row?.event_seq === "number" ? (row.event_seq as number) : null };
  }
  async patchSystemRecord(scope: StudioPersistenceScope, table: StudioSystemTable, id: string, patch: Readonly<Record<string, unknown>>): Promise<StudioPersistenceRecord | null> {
    assertStudioScope(scope);
    // System tables intentionally carry no updated_at column; patch fields only.
    const { data, error } = await this.client().from(table)
      .update({ ...sanitizeRecordPayload(patch) })
      .eq("id", id).eq("organization_id", scope.organizationId).eq("project_id", scope.projectId)
      .select("*").maybeSingle();
    if (error) throw new Error(`Failed to patch Studio system record: ${error.message}`);
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return { id: String(row.id), table, scope, payload: row, createdAt: String(row.created_at), updatedAt: typeof row.updated_at === "string" ? (row.updated_at as string) : null, deletedAt: null };
  }
}
