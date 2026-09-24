/**
 * Studio V2 Job 01 — shared creative-graph envelopes.
 *
 * Minimum canonical contracts every later Studio slice uses: scoped command,
 * action, and event envelopes plus Entity/Reference/DecisionLock revision
 * identifiers. Pure types + small validators; no I/O.
 */

export type CreativeDocumentKind = "brief" | "deliverable" | "direction_spec";

export type CreativeDocumentTable =
  | "studio_briefs"
  | "studio_deliverables"
  | "studio_creative_direction_specs";

export const CREATIVE_DOCUMENT_TABLES: Record<CreativeDocumentKind, CreativeDocumentTable> = {
  brief: "studio_briefs",
  deliverable: "studio_deliverables",
  direction_spec: "studio_creative_direction_specs",
};

export type LockableEntityKind =
  | "brief"
  | "deliverable"
  | "direction_spec"
  | "asset"
  | "asset_variant"
  | "project"
  | "campaign"
  | "claim";

/** Canonical revision identifier: kind + id + revision. Later jobs extend the kinds. */
export interface RevisionRef {
  entityKind: string;
  entityId: string;
  revision: number;
}

export function formatRevisionRef(ref: RevisionRef): string {
  return `${ref.entityKind}:${ref.entityId}:${ref.revision}`;
}

export function parseRevisionRef(value: string): RevisionRef | null {
  const parts = value.split(":");
  if (parts.length !== 3) return null;
  const [entityKind, entityId, revisionRaw] = parts as [string, string, string];
  const revision = Number(revisionRaw);
  if (!entityKind || !entityId || !Number.isInteger(revision) || revision <= 0) return null;
  return { entityKind, entityId, revision };
}

/** Canonical command envelope: every live mutation carries scope + idempotency. */
export interface StudioCommandEnvelope {
  commandId: string;
  idempotencyKey: string;
  kind: string;
  entityKind: CreativeDocumentKind | LockableEntityKind | "graph";
  entityId: string | null;
  expectedRevision: number | null;
  payload: Readonly<Record<string, unknown>>;
}

/** Canonical action envelope: a command accepted for execution. */
export interface StudioActionEnvelope {
  actionId: string;
  commandId: string;
  idempotencyKey: string;
  entityKind: string;
  entityId: string;
  revision: number;
  operation: string;
  status: "accepted" | "applied" | "replayed" | "conflicted" | "rejected";
}

/** Canonical event envelope returned to API/UI callers. */
export interface StudioEventEnvelope {
  eventId: string;
  seq: number | null;
  entityKind: string;
  entityId: string;
  revision: number;
  type: string;
  at: string;
}

export const STUDIO_REVISION_CONFLICT = "STUDIO_REVISION_CONFLICT";
export const STUDIO_IDEMPOTENCY_CONFLICT = "STUDIO_IDEMPOTENCY_CONFLICT";
export const STUDIO_NOT_FOUND = "STUDIO_NOT_FOUND";
export const STUDIO_SCOPE_REQUIRED = "STUDIO_SCOPE_REQUIRED";

export function isRevisionConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes(STUDIO_REVISION_CONFLICT);
}

export function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message.includes(STUDIO_NOT_FOUND);
}

/** Idempotency-Key contract shared by every graph mutation route. */
export function assertIdempotencyKey(value: string | null): string {
  const key = (value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
    throw new Error("STUDIO_IDEMPOTENCY_REQUIRED: Idempotency-Key must be 8-128 [A-Za-z0-9_-] chars.");
  }
  return key;
}

export function assertExpectedRevision(value: unknown): number {
  const revision = typeof value === "string" ? Number(value) : (value as number);
  if (!Number.isInteger(revision) || (revision as number) <= 0) {
    throw new Error("STUDIO_REVISION_REQUIRED: a positive expectedRevision is required for updates.");
  }
  return revision as number;
}
