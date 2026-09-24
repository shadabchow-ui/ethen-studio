import { createHash } from "node:crypto";
import { createServiceClient } from "@ethen/database/service";
import { SupabaseStudioRepository } from "./studio-supabase-repository";
import { isStudioLocalBypass } from "@ethen/ai/platform/auth/studio-local";

/** Complete ownership context required for every Studio persistence operation. */
export interface StudioPersistenceScope {
  organizationId: string;
  projectId: string;
  actorId: string;
}

export type StudioRecordTable =
  | "studio_projects" | "studio_jobs" | "studio_job_attempts" | "studio_job_events" | "studio_provider_runs"
  | "studio_dead_letters" | "studio_assets" | "studio_asset_links" | "studio_uploads" | "studio_exports"
  | "studio_identity_profiles" | "studio_consents" | "studio_moderation_records" | "studio_approvals"
  | "studio_usage_entries" | "studio_canvas_documents" | "studio_canvas_versions" | "studio_canvas_operations"
  | "studio_asset_variants" | "studio_asset_lineage_edges"
  | "studio_briefs" | "studio_deliverables" | "studio_creative_direction_specs" | "studio_decision_locks"
  | "studio_commands" | "studio_events" | "studio_outbox" | "studio_legacy_imports"
  | "studio_takes" | "studio_evaluation_evidence" | "studio_repair_attempts"
  | "studio_director_plans" | "studio_director_tasks" | "studio_director_actions"
  | "studio_review_links"
  | "studio_sequences" | "studio_scenes" | "studio_shots"
  | "studio_campaigns" | "studio_workflows" | "studio_workflow_runs" | "studio_workflow_cache"
  | "studio_creative_entities";

/** Tables carrying a per-project idempotency_key column. */
export type StudioIdempotentTable =
  | "studio_briefs" | "studio_deliverables" | "studio_creative_direction_specs"
  | "studio_commands" | "studio_jobs" | "studio_usage_entries"
  | "studio_creative_entities";

/** Tables carrying an optimistic-concurrency revision column. */
export type StudioRevisionedTable =
  | "studio_briefs" | "studio_deliverables" | "studio_creative_direction_specs" | "studio_creative_entities"
  | "studio_director_plans" | "studio_director_tasks"
  | "studio_sequences" | "studio_scenes" | "studio_shots"
  | "studio_campaigns" | "studio_workflows";

/** System tables writable by field patch (no revision CAS): locks, outbox claims, command log. */
export type StudioSystemTable =
  | "studio_decision_locks" | "studio_outbox" | "studio_commands" | "studio_legacy_imports"
  | "studio_director_actions" | "studio_review_links" | "studio_exports"
  | "studio_workflow_runs";

export interface StudioPersistenceRecord {
  id: string;
  table: StudioRecordTable;
  scope: StudioPersistenceScope;
  payload: Readonly<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

export interface StudioRepository {
  insert(scope: StudioPersistenceScope, table: StudioRecordTable, record: Omit<StudioPersistenceRecord, "table" | "scope">): Promise<void>;
  get(scope: StudioPersistenceScope, table: StudioRecordTable, id: string): Promise<StudioPersistenceRecord | null>;
  list(scope: StudioPersistenceScope, table: StudioRecordTable): Promise<readonly StudioPersistenceRecord[]>;
  softDelete(scope: StudioPersistenceScope, table: StudioRecordTable, id: string): Promise<boolean>;
  /** Idempotent lookup by per-project idempotency key. Returns the live row or null. */
  findByIdempotency(scope: StudioPersistenceScope, table: StudioIdempotentTable, idempotencyKey: string): Promise<StudioPersistenceRecord | null>;
  /**
   * Optimistic-concurrency update: applies patch only when the live row's
   * revision equals expectedRevision, bumps revision by one, and returns the
   * updated record. Throws REVISION_CONFLICT when the row moved, NOT_FOUND
   * when no live row exists.
   */
  updateIfRevision(scope: StudioPersistenceScope, table: StudioRevisionedTable, id: string, expectedRevision: number, patch: Readonly<Record<string, unknown>>): Promise<StudioPersistenceRecord>;
  /** Atomically appends one event plus its outbox row. Returns the event receipt. */
  appendEvent(scope: StudioPersistenceScope, event: Omit<StudioGraphEvent, "id" | "scope">): Promise<StudioEventReceipt>;
  /**
   * Narrow field patch for system tables (lock supersede chains, outbox
   * claims). Restricted to StudioSystemTable; never usable on revisioned
   * documents or idempotency-keyed rows.
   */
  patchSystemRecord(scope: StudioPersistenceScope, table: StudioSystemTable, id: string, patch: Readonly<Record<string, unknown>>): Promise<StudioPersistenceRecord | null>;
}

/** Event envelope input for appendEvent (id/scope are assigned by the repository). */
export interface StudioGraphEvent {
  id: string;
  scope: StudioPersistenceScope;
  entityKind: string;
  entityId: string;
  revision: number;
  type: string;
  payload: Readonly<Record<string, unknown>>;
  target: string;
  actorId: string | null;
}

export interface StudioEventReceipt {
  eventId: string;
  seq: number | null;
}

/** Identity/scope/system fields a payload must never overwrite. Column-valued fields such as revision and idempotency_key pass through intentionally. */
export const RESERVED_RECORD_FIELDS = Object.freeze([
  "id", "organization_id", "project_id", "actor_id",
  "created_at", "updated_at", "deleted_at", "seq",
] as const);

/** Strip reserved identity/scope/system fields from a caller-supplied payload. */
export function sanitizeRecordPayload(payload: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const reserved = new Set<string>(RESERVED_RECORD_FIELDS);
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!reserved.has(key)) clean[key] = value;
  }
  return clean;
}

export function assertStudioScope(scope: StudioPersistenceScope): void {
  for (const [key, value] of Object.entries(scope)) {
    if (!value?.trim()) throw new Error(`Studio persistence requires ${key}.`);
  }
}

/** Hash a provider reference before persistence; raw provider URLs and secrets are forbidden. */
export function hashStudioExternalReference(reference: string): string {
  if (!reference.trim()) throw new Error("Studio external reference cannot be empty.");
  return createHash("sha256").update(reference).digest("hex");
}

/** Explicit local/test adapter. It is never selected by the production repository factory. */
export class MemoryStudioRepository implements StudioRepository {
  private records = new Map<string, StudioPersistenceRecord>();
  private eventSeq = 0;
  private key(scope: StudioPersistenceScope, table: StudioRecordTable, id: string) { return `${scope.organizationId}:${scope.projectId}:${table}:${id}`; }
  async insert(scope: StudioPersistenceScope, table: StudioRecordTable, record: Omit<StudioPersistenceRecord, "table" | "scope">): Promise<void> {
    assertStudioScope(scope);
    const key = this.key(scope, table, record.id);
    if (this.records.has(key)) throw new Error("Studio record already exists in this project.");
    const payload = sanitizeRecordPayload(record.payload);
    // Mirror the SQL partial unique (project_id, idempotency_key) for idempotent tables.
    const incomingKey = (payload as Record<string, unknown>).idempotency_key;
    if (IDEMPOTENT_TABLES.has(table) && typeof incomingKey === "string" && incomingKey.length > 0) {
      for (const existing of this.records.values()) {
        if (existing.table !== table || existing.deletedAt !== null) continue;
        if (existing.scope.organizationId !== scope.organizationId || existing.scope.projectId !== scope.projectId) continue;
        if ((existing.payload as Record<string, unknown>).idempotency_key === incomingKey) {
          throw new Error("STUDIO_IDEMPOTENCY_CONFLICT: idempotency key already used in this project.");
        }
      }
    }
    this.records.set(key, { ...record, payload, table, scope: { ...scope } });
  }
  async get(scope: StudioPersistenceScope, table: StudioRecordTable, id: string): Promise<StudioPersistenceRecord | null> {
    assertStudioScope(scope); return this.records.get(this.key(scope, table, id)) ?? null;
  }
  async list(scope: StudioPersistenceScope, table: StudioRecordTable): Promise<readonly StudioPersistenceRecord[]> {
    assertStudioScope(scope);
    return [...this.records.values()].filter((record) => record.table === table && record.scope.organizationId === scope.organizationId && record.scope.projectId === scope.projectId && record.deletedAt === null);
  }
  async softDelete(scope: StudioPersistenceScope, table: StudioRecordTable, id: string): Promise<boolean> {
    const record = await this.get(scope, table, id); if (!record || record.deletedAt) return false;
    this.records.set(this.key(scope, table, id), { ...record, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); return true;
  }
  async findByIdempotency(scope: StudioPersistenceScope, table: StudioIdempotentTable, idempotencyKey: string): Promise<StudioPersistenceRecord | null> {
    assertStudioScope(scope);
    for (const record of this.records.values()) {
      if (record.table !== table) continue;
      if (record.scope.organizationId !== scope.organizationId || record.scope.projectId !== scope.projectId) continue;
      if (record.deletedAt !== null) continue;
      const key = (record.payload as Record<string, unknown>).idempotency_key;
      if (typeof key === "string" && key === idempotencyKey) return record;
    }
    return null;
  }
  async updateIfRevision(scope: StudioPersistenceScope, table: StudioRevisionedTable, id: string, expectedRevision: number, patch: Readonly<Record<string, unknown>>): Promise<StudioPersistenceRecord> {
    assertStudioScope(scope);
    const key = this.key(scope, table, id);
    const record = this.records.get(key);
    if (!record || record.deletedAt) throw new Error("STUDIO_NOT_FOUND: no live record for optimistic update.");
    const current = (record.payload as Record<string, unknown>).revision;
    if (current !== expectedRevision) throw new Error(`STUDIO_REVISION_CONFLICT: expected ${expectedRevision}, found ${String(current)}.`);
    const now = new Date().toISOString();
    // Caller patch wins, untouched payload fields are kept, revision bumps by one.
    const updated: StudioPersistenceRecord = {
      ...record,
      payload: { ...(record.payload as Record<string, unknown>), ...sanitizeRecordPayload(patch), revision: expectedRevision + 1 },
      updatedAt: now,
    };
    this.records.set(key, updated);
    return updated;
  }
  async appendEvent(scope: StudioPersistenceScope, event: Omit<StudioGraphEvent, "id" | "scope">): Promise<StudioEventReceipt> {
    assertStudioScope(scope);
    if (!event.entityKind?.trim() || !event.entityId?.trim() || !event.type?.trim() || !event.target?.trim()) {
      throw new Error("STUDIO_EVENT_REQUIRED: entityKind, entityId, type and target are required.");
    }
    if (!Number.isInteger(event.revision) || event.revision <= 0) throw new Error("STUDIO_EVENT_REQUIRED: positive revision is required.");
    const now = new Date().toISOString();
    this.eventSeq += 1;
    const eventId = `evt_${Date.now().toString(36)}_${this.eventSeq}`;
    // Single synchronous block: event + outbox are appended atomically.
    this.records.set(this.key(scope, "studio_events", eventId), {
      id: eventId, table: "studio_events", scope: { ...scope },
      payload: { entity_kind: event.entityKind, entity_id: event.entityId, revision: event.revision, type: event.type, ...sanitizeRecordPayload(event.payload), seq: this.eventSeq },
      createdAt: now, updatedAt: null, deletedAt: null,
    });
    const outboxId = `out_${Date.now().toString(36)}_${this.eventSeq}`;
    this.records.set(this.key(scope, "studio_outbox", outboxId), {
      id: outboxId, table: "studio_outbox", scope: { ...scope },
      payload: { event_id: eventId, target: event.target, claimed_at: null, delivered_at: null },
      createdAt: now, updatedAt: null, deletedAt: null,
    });
    return { eventId, seq: this.eventSeq };
  }
  async patchSystemRecord(scope: StudioPersistenceScope, table: StudioSystemTable, id: string, patch: Readonly<Record<string, unknown>>): Promise<StudioPersistenceRecord | null> {
    assertStudioScope(scope);
    const key = this.key(scope, table, id);
    const record = this.records.get(key);
    if (!record) return null;
    const updated: StudioPersistenceRecord = {
      ...record,
      payload: { ...(record.payload as Record<string, unknown>), ...sanitizeRecordPayload(patch) },
      updatedAt: new Date().toISOString(),
    };
    this.records.set(key, updated);
    return updated;
  }
}

/** Factory: production uses SupabaseStudioRepository; tests/local use Memory. Never silently falls back in production. */
export function getStudioRepository(): StudioRepository {
  if (isStudioLocalBypass({ host: "localhost" })) return localStudioRepository;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return new MemoryStudioRepository();
  }
  try {
    if (createServiceClient()) return new SupabaseStudioRepository();
  } catch { /* fall through to explicit memory for non-production */ }
  // Non-production without Supabase env: allow memory but label it.
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Studio production persistence requires a configured Supabase service client — memory fallback is not allowed in production.");
  }
  return new MemoryStudioRepository();
}

const localStudioRepository = new MemoryStudioRepository();

/** Cross-project isolation helper: verifies record belongs to scope. */
export function assertSameProject(scope: StudioPersistenceScope, record: StudioPersistenceRecord): void {
  if (record.scope.projectId !== scope.projectId || record.scope.organizationId !== scope.organizationId) {
    throw new Error("Cross-project access denied — record does not belong to the requested project.");
  }
}

/** Tables whose live rows must be unique per (project, idempotency_key) — mirrors the SQL partial uniques. */
export const IDEMPOTENT_TABLES: ReadonlySet<string> = new Set<string>([
  "studio_briefs", "studio_deliverables", "studio_creative_direction_specs",
  "studio_commands", "studio_jobs", "studio_usage_entries",
  "studio_creative_entities",
]);
