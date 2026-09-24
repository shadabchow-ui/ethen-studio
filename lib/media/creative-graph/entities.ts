/**
 * Studio V3 Job 4 — durable creative entities (Character/Product/Brand).
 *
 * Same contracts as the graph documents: tenant scope, Idempotency-Key with
 * replay, optimistic-concurrency revisions, soft delete, command log +
 * graph events. Entities carry identity, reference assets, preserve/change/
 * target rules, preferred views/styling/notes, generation history and
 * approved outputs inside the revisioned payload.
 */

import { randomUUID } from "node:crypto";

import {
  assertExpectedRevision,
  assertIdempotencyKey,
  STUDIO_IDEMPOTENCY_CONFLICT,
  type StudioActionEnvelope,
  type StudioEventEnvelope,
} from "./envelopes";
import {
  assertStudioScope,
  getStudioRepository,
  type StudioPersistenceRecord,
  type StudioPersistenceScope,
  type StudioRepository,
} from "../persistence/studio-repository";

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique|duplicate|23505|already used|already exists/i.test(message);
}

export type CreativeEntityKind = "character" | "product" | "brand";

export const CREATIVE_ENTITY_KINDS: readonly CreativeEntityKind[] = ["character", "product", "brand"];

export const CREATIVE_ENTITIES_TABLE = "studio_creative_entities" as const;

export function assertEntityKind(value: string): CreativeEntityKind {
  if (value === "character" || value === "product" || value === "brand") return value;
  throw new Error(`STUDIO_ENTITY_KIND_UNKNOWN: ${value} is not a creative entity kind.`);
}

export interface EntityRules {
  preserve?: string[];
  change?: string[];
  target?: string[];
}

export interface EntityPreferences {
  views?: string[];
  styling?: string[];
  notes?: string;
}

export interface EntityInput {
  name: string;
  status?: string;
  referenceAssetIds?: string[];
  rules?: EntityRules;
  preferences?: EntityPreferences;
  /** Generation history entries (job ids + labels), newest last. */
  history?: Array<{ jobId: string; label: string; at?: string }>;
  approvedOutputIds?: string[];
}

export interface EntityPatch {
  name?: string;
  status?: string;
  referenceAssetIds?: string[];
  rules?: EntityRules;
  preferences?: EntityPreferences;
  history?: Array<{ jobId: string; label: string; at?: string }>;
  approvedOutputIds?: string[];
}

export interface EntityResult {
  record: StudioPersistenceRecord;
  action: StudioActionEnvelope;
  event: StudioEventEnvelope;
  replayed: boolean;
}

export interface EntitySummary {
  id: string;
  kind: CreativeEntityKind;
  name: string;
  status: string;
  revision: number;
  referenceAssetIds: string[];
  rules: EntityRules;
  preferences: EntityPreferences;
  history: Array<{ jobId: string; label: string; at?: string }>;
  approvedOutputIds: string[];
  createdAt: string;
  updatedAt: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function recordRevision(record: StudioPersistenceRecord): number {
  const revision = (record.payload as Record<string, unknown>).revision;
  return typeof revision === "number" && Number.isInteger(revision) ? revision : 1;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function asRules(value: unknown): EntityRules {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return { preserve: asStringList(record.preserve), change: asStringList(record.change), target: asStringList(record.target) };
}

function asPreferences(value: unknown): EntityPreferences {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const notes = typeof record.notes === "string" ? record.notes : undefined;
  return { views: asStringList(record.views), styling: asStringList(record.styling), ...(notes === undefined ? {} : { notes }) };
}

function asHistory(value: unknown): Array<{ jobId: string; label: string; at?: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      jobId: typeof entry.jobId === "string" ? entry.jobId : "",
      label: typeof entry.label === "string" ? entry.label : "",
      ...(typeof entry.at === "string" ? { at: entry.at } : {}),
    }))
    .filter((entry) => entry.jobId && entry.label);
}

function cleanInput(input: EntityInput | EntityPatch, requireName: boolean): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (input.name !== undefined || requireName) {
    const name = input.name?.trim() ?? "";
    if (!name) throw new Error("STUDIO_NAME_REQUIRED: entity name is required.");
    if (name.length > 120) throw new Error("STUDIO_NAME_TOO_LONG: entity name exceeds 120 characters.");
    clean.name = name;
  }
  if (input.status !== undefined) clean.status = input.status.trim() || "draft";
  if (input.referenceAssetIds !== undefined) clean.referenceAssetIds = asStringList(input.referenceAssetIds).slice(0, 24);
  if (input.rules !== undefined) clean.rules = asRules(input.rules);
  if (input.preferences !== undefined) clean.preferences = asPreferences(input.preferences);
  if (input.history !== undefined) clean.history = asHistory(input.history).slice(-50);
  if (input.approvedOutputIds !== undefined) clean.approvedOutputIds = asStringList(input.approvedOutputIds).slice(0, 50);
  return clean;
}

export function toEntitySummary(kind: CreativeEntityKind, record: StudioPersistenceRecord): EntitySummary {
  const payload = record.payload as Record<string, unknown>;
  const detail = (payload.detail ?? {}) as Record<string, unknown>;
  return {
    id: record.id,
    kind,
    name: typeof payload.name === "string" ? payload.name : "",
    status: typeof payload.status === "string" ? payload.status : "draft",
    revision: recordRevision(record),
    referenceAssetIds: asStringList(detail.referenceAssetIds ?? payload.referenceAssetIds),
    rules: asRules(detail.rules ?? payload.rules),
    preferences: asPreferences(detail.preferences ?? payload.preferences),
    history: asHistory(detail.history ?? payload.history),
    approvedOutputIds: asStringList(detail.approvedOutputIds ?? payload.approvedOutputIds),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function entityKindOf(record: StudioPersistenceRecord): CreativeEntityKind | null {
  const kind = (record.payload as Record<string, unknown>).kind;
  return kind === "character" || kind === "product" || kind === "brand" ? kind : null;
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
      payload: { kind, idempotency_key: idempotencyKey, status: "completed", result: (result ?? {}) as Record<string, unknown> },
      createdAt: nowIso(),
      updatedAt: null,
      deletedAt: null,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
}

export async function createEntity(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: CreativeEntityKind,
  input: EntityInput,
  idempotencyKey: string,
): Promise<EntityResult> {
  assertStudioScope(scope);
  const key = assertIdempotencyKey(idempotencyKey);
  const clean = cleanInput(input, true);
  const commandId = randomUUID();

  const replayed = await repo.findByIdempotency(scope, CREATIVE_ENTITIES_TABLE, key);
  if (replayed) {
    if (entityKindOf(replayed) !== kind) {
      throw new Error(`${STUDIO_IDEMPOTENCY_CONFLICT}: idempotency key was used for a different entity kind.`);
    }
    return {
      record: replayed,
      action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: replayed.id, revision: recordRevision(replayed), operation: `${kind}.create`, status: "replayed" },
      event: { eventId: "", seq: null, entityKind: kind, entityId: replayed.id, revision: recordRevision(replayed), type: `${kind}.create.replayed`, at: nowIso() },
      replayed: true,
    };
  }

  const id = randomUUID();
  const at = nowIso();
  try {
    await repo.insert(scope, CREATIVE_ENTITIES_TABLE, {
      id,
      payload: { kind, name: clean.name, status: clean.status ?? "draft", detail: clean, idempotency_key: key, revision: 1 },
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await repo.findByIdempotency(scope, CREATIVE_ENTITIES_TABLE, key);
      if (winner && entityKindOf(winner) === kind) {
        return {
          record: winner,
          action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: winner.id, revision: recordRevision(winner), operation: `${kind}.create`, status: "replayed" },
          event: { eventId: "", seq: null, entityKind: kind, entityId: winner.id, revision: recordRevision(winner), type: `${kind}.create.replayed`, at },
          replayed: true,
        };
      }
    }
    throw error;
  }
  await logCommand(repo, scope, `${kind}.create`, key, { name: clean.name }, { entityId: id, revision: 1 });
  const receipt = await repo.appendEvent(scope, { entityKind: kind, entityId: id, revision: 1, type: `${kind}.created`, payload: { name: clean.name }, target: "studio-graph", actorId: scope.actorId });
  const record = await repo.get(scope, CREATIVE_ENTITIES_TABLE, id);
  if (!record) throw new Error("STUDIO_NOT_FOUND: created entity is not readable.");
  return {
    record,
    action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: id, revision: 1, operation: `${kind}.create`, status: "applied" },
    event: { eventId: receipt.eventId, seq: receipt.seq, entityKind: kind, entityId: id, revision: 1, type: `${kind}.created`, at },
    replayed: false,
  };
}

/** Update a revisioned entity with optimistic concurrency. Stale writers get REVISION_CONFLICT. */
export async function updateEntity(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: CreativeEntityKind,
  id: string,
  expectedRevision: number,
  patch: EntityPatch,
  idempotencyKey: string,
): Promise<EntityResult> {
  assertStudioScope(scope);
  const key = assertIdempotencyKey(idempotencyKey);
  const expected = assertExpectedRevision(expectedRevision);
  const commandId = randomUUID();

  const current = await repo.get(scope, CREATIVE_ENTITIES_TABLE, id);
  if (!current || current.deletedAt || entityKindOf(current) !== kind) {
    throw new Error("STUDIO_NOT_FOUND: no live entity for update.");
  }
  const clean = cleanInput(patch, false);
  const merged = { ...(current.payload as Record<string, unknown>), ...clean, detail: { ...((current.payload as Record<string, unknown>).detail as Record<string, unknown> ?? {}), ...clean } };
  delete (merged as Record<string, unknown>).revision;
  const record = await repo.updateIfRevision(scope, CREATIVE_ENTITIES_TABLE, id, expected, merged);
  const revision = recordRevision(record);
  await logCommand(repo, scope, `${kind}.update`, key, { entityId: id, expectedRevision: expected, patch: clean }, { entityId: id, revision });
  const receipt = await repo.appendEvent(scope, { entityKind: kind, entityId: id, revision, type: `${kind}.updated`, payload: { expectedRevision: expected }, target: "studio-graph", actorId: scope.actorId });
  return {
    record,
    action: { actionId: `act_${commandId}`, commandId, idempotencyKey: key, entityKind: kind, entityId: id, revision, operation: `${kind}.update`, status: "applied" },
    event: { eventId: receipt.eventId, seq: receipt.seq, entityKind: kind, entityId: id, revision, type: `${kind}.updated`, at: nowIso() },
    replayed: false,
  };
}

export async function getEntity(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: CreativeEntityKind,
  id: string,
): Promise<EntitySummary | null> {
  assertStudioScope(scope);
  const record = await repo.get(scope, CREATIVE_ENTITIES_TABLE, id);
  if (!record || record.deletedAt || entityKindOf(record) !== kind) return null;
  return toEntitySummary(kind, record);
}

export async function listEntities(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: CreativeEntityKind,
): Promise<EntitySummary[]> {
  assertStudioScope(scope);
  const rows = await repo.list(scope, CREATIVE_ENTITIES_TABLE);
  return rows
    .filter((row) => !row.deletedAt && entityKindOf(row) === kind)
    .map((row) => toEntitySummary(kind, row))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function deleteEntity(
  repo: StudioRepository,
  scope: StudioPersistenceScope,
  kind: CreativeEntityKind,
  id: string,
  idempotencyKey: string,
): Promise<boolean> {
  assertStudioScope(scope);
  assertIdempotencyKey(idempotencyKey);
  const current = await repo.get(scope, CREATIVE_ENTITIES_TABLE, id);
  if (!current || current.deletedAt || entityKindOf(current) !== kind) return false;
  const deleted = await repo.softDelete(scope, CREATIVE_ENTITIES_TABLE, id);
  if (deleted) {
    await repo.appendEvent(scope, { entityKind: kind, entityId: id, revision: recordRevision(current), type: `${kind}.deleted`, payload: {}, target: "studio-graph", actorId: scope.actorId });
  }
  return deleted;
}

export function getEntityRepository(): StudioRepository {
  return getStudioRepository();
}
