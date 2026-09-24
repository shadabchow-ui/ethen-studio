/**
 * Studio V2 Job 01 — canonical creative-graph service.
 *
 * Single authority for Brief / Deliverable / CreativeDirectionSpec mutations:
 * every live mutation carries scope + revision + idempotency, authorization
 * and revision checks happen inside the repository calls below, and every
 * applied mutation appends one event plus one outbox row atomically.
 * Route layers enforce membership (requireProject) before calling in.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  assertStudioScope,
  type StudioPersistenceRecord,
  type StudioPersistenceScope,
  type StudioRepository,
} from "../persistence/studio-repository";
import {
  CREATIVE_DOCUMENT_TABLES,
  assertExpectedRevision,
  assertIdempotencyKey,
  type CreativeDocumentKind,
  type LockableEntityKind,
  type StudioActionEnvelope,
  type StudioEventEnvelope,
} from "./envelopes";

export interface DocumentInput {
  title: string;
  status?: string;
  body?: Readonly<Record<string, unknown>>;
}

export interface DocumentResult {
  record: StudioPersistenceRecord;
  action: StudioActionEnvelope;
  event: StudioEventEnvelope;
  replayed: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|duplicate|23505|already used|already exists/i.test(message);
}

function toEventEnvelope(
  receipt: { eventId: string; seq: number | null },
  entityKind: string,
  entityId: string,
  revision: number,
  type: string,
): StudioEventEnvelope {
  return { eventId: receipt.eventId, seq: receipt.seq, entityKind, entityId, revision, type, at: nowIso() };
}

function recordRevision(record: StudioPersistenceRecord): number {
  const revision = (record.payload as Record<string, unknown>).revision;
  return typeof revision === "number" ? revision : 1;
}

/** Create a revisioned document idempotently. Replay returns the original row. */
export async function createDocument(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: CreativeDocumentKind,
  input: DocumentInput,
  idempotencyKey: string,
): Promise<DocumentResult> {
  assertStudioScope(scope);
  const key = assertIdempotencyKey(idempotencyKey);
  const title = input.title?.trim();
  if (!title) throw new Error("STUDIO_TITLE_REQUIRED: document title is required.");
  const table = CREATIVE_DOCUMENT_TABLES[kind];
  const commandId = randomUUID();

  const replayed = await repo.findByIdempotency(scope, table, key);
  if (replayed) {
    return {
      record: replayed,
      action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: replayed.id, revision: recordRevision(replayed), operation: `${kind}.create`, status: "replayed" },
      event: toEventEnvelope({ eventId: "", seq: null }, kind, replayed.id, recordRevision(replayed), `${kind}.create.replayed`),
      replayed: true,
    };
  }

  const id = randomUUID();
  const at = nowIso();
  const body = (input.body ?? {}) as Record<string, unknown>;
  try {
    await repo.insert(scope, table, {
      id,
      payload: { title, status: input.status?.trim() || "draft", payload: body, idempotency_key: key, revision: 1 },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
  } catch (error) {
    // Lost race with a concurrent create under the same key: replay the winner.
    if (isUniqueViolation(error)) {
      const winner = await repo.findByIdempotency(scope, table, key);
      if (winner) {
        return {
          record: winner,
          action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: winner.id, revision: recordRevision(winner), operation: `${kind}.create`, status: "replayed" },
          event: toEventEnvelope({ eventId: "", seq: null }, kind, winner.id, recordRevision(winner), `${kind}.create.replayed`),
          replayed: true,
        };
      }
    }
    throw error;
  }
  await logCommand(repo, scope, `${kind}.create`, key, { title, status: input.status ?? "draft", body }, { entityId: id, revision: 1 });
  const receipt = await repo.appendEvent(scope, { entityKind: kind, entityId: id, revision: 1, type: `${kind}.created`, payload: { title }, target: "studio-graph", actorId: scope.actorId });
  const record = await repo.get(scope, table, id);
  if (!record) throw new Error("STUDIO_NOT_FOUND: created document is not readable.");
  return {
    record,
    action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: id, revision: 1, operation: `${kind}.create`, status: "applied" },
    event: toEventEnvelope(receipt, kind, id, 1, `${kind}.created`),
    replayed: false,
  };
}

/** Update a revisioned document with optimistic concurrency. Stale writers get REVISION_CONFLICT. */
export async function updateDocument(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: CreativeDocumentKind,
  id: string,
  expectedRevision: number,
  patch: { title?: string; status?: string; body?: Readonly<Record<string, unknown>> },
  idempotencyKey: string,
): Promise<DocumentResult> {
  assertStudioScope(scope);
  const key = assertIdempotencyKey(idempotencyKey);
  const expected = assertExpectedRevision(expectedRevision);
  const table = CREATIVE_DOCUMENT_TABLES[kind];
  const commandId = randomUUID();

  const clean: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new Error("STUDIO_TITLE_REQUIRED: document title cannot be blank.");
    clean.title = patch.title.trim();
  }
  if (patch.status !== undefined) clean.status = patch.status.trim() || "draft";
  if (patch.body !== undefined) clean.payload = { ...patch.body };

  const record = await repo.updateIfRevision(scope, table, id, expected, clean);
  const revision = recordRevision(record);
  await logCommand(repo, scope, `${kind}.update`, key, { entityId: id, expectedRevision: expected, patch: clean }, { entityId: id, revision });
  const receipt = await repo.appendEvent(scope, { entityKind: kind, entityId: id, revision, type: `${kind}.updated`, payload: { expectedRevision: expected }, target: "studio-graph", actorId: scope.actorId });
  return {
    record,
    action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: id, revision, operation: `${kind}.update`, status: "applied" },
    event: toEventEnvelope(receipt, kind, id, revision, `${kind}.updated`),
    replayed: false,
  };
}

async function logCommand(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: string,
  idempotencyKey: string,
  request: unknown,
  result: unknown,
): Promise<void> {
  try {
    await repo.insert(scope, "studio_commands", {
      id: randomUUID(),
      payload: { kind, idempotency_key: idempotencyKey, request_hash: requestHash(request), status: "completed", result: (result ?? {}) as Record<string, unknown> },
      createdAt: nowIso(),
      updatedAt: null,
      deletedAt: null,
    });
  } catch (error) {
    // The command log is audit-only: a duplicate key means this exact command
    // was already logged (replay path), never a reason to fail the mutation.
    if (!isUniqueViolation(error)) throw error;
  }
}

export interface DecisionLockInput {
  entityKind: LockableEntityKind;
  entityId: string;
  entityRevision: number;
  payloadHash: string;
}

export interface DecisionLockResult {
  record: StudioPersistenceRecord;
  replayed: boolean;
  supersededId: string | null;
}

/** Lock an entity revision. Same revision replays; a newer revision supersedes the current lock. */
export async function lockDecision(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  input: DecisionLockInput,
  idempotencyKey: string,
): Promise<DecisionLockResult> {
  assertStudioScope(scope);
  assertIdempotencyKey(idempotencyKey);
  if (!input.entityKind?.trim() || !input.entityId?.trim()) throw new Error("STUDIO_LOCK_REQUIRED: entityKind and entityId are required.");
  const revision = assertExpectedRevision(input.entityRevision);
  if (!/^[0-9a-f]{64}$/.test(input.payloadHash ?? "")) throw new Error("STUDIO_LOCK_REQUIRED: payloadHash must be sha256 hex.");

  const locks = await repo.list(scope, "studio_decision_locks");
  const current = locks.find((row) => {
    const payload = row.payload as Record<string, unknown>;
    return payload.entity_kind === input.entityKind && payload.entity_id === input.entityId && (payload.superseded_by ?? null) === null;
  });

  if (current) {
    const payload = current.payload as Record<string, unknown>;
    if (payload.entity_revision === revision && payload.payload_hash === input.payloadHash) {
      return { record: current, replayed: true, supersededId: null };
    }
    if ((revision as number) <= (payload.entity_revision as number)) {
      throw new Error("STUDIO_REVISION_CONFLICT: decision lock already covers a newer entity revision.");
    }
  }

  const id = randomUUID();
  const at = nowIso();
  await repo.insert(scope, "studio_decision_locks", {
    id,
    payload: { entity_kind: input.entityKind, entity_id: input.entityId, entity_revision: revision, payload_hash: input.payloadHash, superseded_by: null, decided_at: at },
    createdAt: at,
    updatedAt: null,
    deletedAt: null,
  });
  let supersededId: string | null = null;
  if (current) {
    await repo.patchSystemRecord(scope, "studio_decision_locks", current.id, { superseded_by: id });
    supersededId = current.id;
  }
  await repo.appendEvent(scope, { entityKind: input.entityKind, entityId: input.entityId, revision, type: "decision.locked", payload: { lock_id: id, superseded_id: supersededId }, target: "studio-graph", actorId: scope.actorId });
  const record = await repo.get(scope, "studio_decision_locks", id);
  if (!record) throw new Error("STUDIO_NOT_FOUND: created decision lock is not readable.");
  return { record, replayed: false, supersededId };
}

export interface ProjectGraphSummary {
  organizationId: string;
  projectId: string;
  briefs: StudioPersistenceRecord[];
  deliverables: StudioPersistenceRecord[];
  directionSpecs: StudioPersistenceRecord[];
  assets: StudioPersistenceRecord[];
  decisionLocks: StudioPersistenceRecord[];
  pendingOutbox: number;
  latestEvents: StudioPersistenceRecord[];
}

/** Read one project graph: documents + locks + assets + latest events + outbox depth. */
export async function readProjectGraph(repo: StudioRepository, scope: StudioPersistenceScope): Promise<ProjectGraphSummary> {
  assertStudioScope(scope);
  const [briefs, deliverables, directionSpecs, assets, decisionLocks, events, outbox] = await Promise.all([
    repo.list(scope, "studio_briefs"),
    repo.list(scope, "studio_deliverables"),
    repo.list(scope, "studio_creative_direction_specs"),
    repo.list(scope, "studio_assets"),
    repo.list(scope, "studio_decision_locks"),
    repo.list(scope, "studio_events"),
    repo.list(scope, "studio_outbox"),
  ]);
  const pending = outbox.filter((row) => ((row.payload as Record<string, unknown>).delivered_at ?? null) === null).length;
  const latest = [...events].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 50);
  return {
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    briefs: [...briefs],
    deliverables: [...deliverables],
    directionSpecs: [...directionSpecs],
    assets: [...assets],
    decisionLocks: [...decisionLocks],
    pendingOutbox: pending,
    latestEvents: latest,
  };
}

/** Ensure the studio_projects extension row exists for a Platform project (idempotent). */
export async function ensureStudioProject(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  name: string,
): Promise<StudioPersistenceRecord> {
  assertStudioScope(scope);
  const existing = await repo.list(scope, "studio_projects");
  if (existing.length > 0) return existing[0] as StudioPersistenceRecord;
  const at = nowIso();
  const id = randomUUID();
  await repo.insert(scope, "studio_projects", { id, payload: { name: name?.trim() || "Studio project", settings: {} }, createdAt: at, updatedAt: at, deletedAt: null });
  const record = await repo.get(scope, "studio_projects", id);
  if (!record) throw new Error("STUDIO_NOT_FOUND: studio project extension is not readable.");
  await repo.appendEvent(scope, { entityKind: "project", entityId: scope.projectId, revision: 1, type: "project.provisioned", payload: { name: record.payload }, target: "studio-graph", actorId: scope.actorId });
  return record;
}
