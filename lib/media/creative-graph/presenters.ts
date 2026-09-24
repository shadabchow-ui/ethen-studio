/**
 * Studio V2 Job 01 — canonical graph presenters.
 * Normalize Memory-shaped (nested) and Supabase-shaped (flat row) records
 * into one stable API shape. Client-safe (no imports).
 */

import type { StudioPersistenceRecord } from "../persistence/studio-repository";

function payload(record: StudioPersistenceRecord): Record<string, unknown> {
  return record.payload as Record<string, unknown>;
}

export interface PresentedDocument {
  id: string;
  title: string;
  status: string;
  revision: number;
  body: Record<string, unknown>;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export function presentDocument(record: StudioPersistenceRecord): PresentedDocument {
  const data = payload(record);
  return {
    id: record.id,
    title: typeof data.title === "string" ? data.title : "",
    status: typeof data.status === "string" ? data.status : "draft",
    revision: typeof data.revision === "number" ? data.revision : 1,
    body: (data.payload as Record<string, unknown>) ?? {},
    idempotencyKey: typeof data.idempotency_key === "string" ? (data.idempotency_key as string) : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface PresentedAsset {
  id: string;
  kind: string;
  title: string;
  contentHash: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function presentAsset(record: StudioPersistenceRecord): PresentedAsset {
  const data = payload(record);
  const metadata = (data.metadata as Record<string, unknown>) ?? {};
  return {
    id: record.id,
    kind: typeof data.asset_kind === "string" ? (data.asset_kind as string) : typeof data.kind === "string" ? (data.kind as string) : "unknown",
    title: typeof data.title === "string" ? (data.title as string) : typeof metadata.name === "string" ? (metadata.name as string) : record.id,
    contentHash: typeof data.content_hash === "string" ? (data.content_hash as string) : null,
    metadata,
    createdAt: record.createdAt,
  };
}

export interface PresentedLock {
  id: string;
  entityKind: string;
  entityId: string;
  entityRevision: number;
  payloadHash: string;
  supersededBy: string | null;
  decidedAt: string;
}

export function presentLock(record: StudioPersistenceRecord): PresentedLock {
  const data = payload(record);
  return {
    id: record.id,
    entityKind: String(data.entity_kind ?? ""),
    entityId: String(data.entity_id ?? ""),
    entityRevision: typeof data.entity_revision === "number" ? (data.entity_revision as number) : 0,
    payloadHash: String(data.payload_hash ?? ""),
    supersededBy: typeof data.superseded_by === "string" ? (data.superseded_by as string) : null,
    decidedAt: typeof data.decided_at === "string" ? (data.decided_at as string) : record.createdAt,
  };
}

export interface PresentedEvent {
  id: string;
  entityKind: string;
  entityId: string;
  revision: number;
  type: string;
  seq: number | null;
  createdAt: string;
}

export function presentEvent(record: StudioPersistenceRecord): PresentedEvent {
  const data = payload(record);
  return {
    id: record.id,
    entityKind: String(data.entity_kind ?? ""),
    entityId: String(data.entity_id ?? ""),
    revision: typeof data.revision === "number" ? (data.revision as number) : 0,
    type: String(data.type ?? ""),
    seq: typeof data.seq === "number" ? (data.seq as number) : null,
    createdAt: record.createdAt,
  };
}
