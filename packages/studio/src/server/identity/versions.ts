/** Studio V5 identity — immutable content versions (STUDIO_10). Server-only. */
import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { IdentityBundle, IdentityKind, IdentityOrigin, ProjectScope } from "./types";
import { IdentityStoreError, type IdentityRecord, type IdentityVersionRecord } from "./types";

/** Canonical JSON: sorted keys, stable nesting, no whitespace. */
export function canonicalizeIdentityPayload(payload: Readonly<Record<string, unknown>>): string {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) sorted[key] = visit(record[key]);
      return sorted;
    }
    return value;
  };
  return JSON.stringify(visit(payload));
}

export function hashIdentityContent(payload: Readonly<Record<string, unknown>>): string {
  return `sha256:${createHash("sha256").update(canonicalizeIdentityPayload(payload), "utf8").digest("hex")}`;
}

export interface CreateIdentityInput {
  scope: ProjectScope | null;
  kind: IdentityKind;
  origin: IdentityOrigin;
  name: string;
  payload: Readonly<Record<string, unknown>>;
  consentGrantId?: string | null;
  now?: string;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new IdentityStoreError("IDENTITY_VALIDATION", "Identity name is required.");
  if (trimmed.length > 120) throw new IdentityStoreError("IDENTITY_VALIDATION", "Identity name exceeds 120 characters.");
  return trimmed;
}

function nowIso(now?: string): string {
  return now ?? new Date().toISOString();
}

/** Create an identity head plus immutable version 1. Stock identities carry a null scope (global). */
export function buildIdentityWithVersion1(input: CreateIdentityInput): {
  record: IdentityRecord;
  version: IdentityVersionRecord;
  /** Null for stock: stock bundles resolve scope at use time, not at rest. */
  bundle: IdentityBundle | null;
} {
  const at = nowIso(input.now);
  const identityId = randomUUID();
  const record: IdentityRecord = {
    identityId,
    scope: input.scope,
    kind: input.kind,
    origin: input.origin,
    name: cleanName(input.name),
    currentVersion: 1,
    status: "active",
    createdAt: at,
    updatedAt: at,
  };
  const version: IdentityVersionRecord = {
    identityId,
    version: 1,
    contentHash: hashIdentityContent(input.payload),
    payload: { ...input.payload },
    consentGrantId: input.consentGrantId ?? null,
    revokedAt: null,
    createdAt: at,
  };
  return { record, version, bundle: record.scope ? toBundle(record, version) : null };
}

export interface AppendVersionInput {
  record: IdentityRecord;
  /** Highest stored version; the append must be exactly latest + 1. */
  latestVersion: number;
  payload: Readonly<Record<string, unknown>>;
  consentGrantId?: string | null;
  now?: string;
}

/**
 * Append a new immutable version. Any attempt to rewrite an existing
 * version number is rejected — versions are content-addressed history,
 * never mutable state.
 */
export function buildNextIdentityVersion(input: AppendVersionInput): {
  record: IdentityRecord;
  version: IdentityVersionRecord;
  bundle: IdentityBundle;
} {
  if (!Number.isInteger(input.latestVersion) || input.latestVersion < 1) {
    throw new IdentityStoreError("IDENTITY_VALIDATION", "Latest version must be a positive integer.");
  }
  if (input.record.currentVersion !== input.latestVersion) {
    throw new IdentityStoreError("IDENTITY_VERSION_CONFLICT", "Identity head is ahead of the supplied latest version.", {
      currentVersion: input.record.currentVersion,
      latestVersion: input.latestVersion,
    });
  }
  const at = nowIso(input.now);
  const next = input.latestVersion + 1;
  const version: IdentityVersionRecord = {
    identityId: input.record.identityId,
    version: next,
    contentHash: hashIdentityContent(input.payload),
    payload: { ...input.payload },
    consentGrantId: input.consentGrantId ?? null,
    revokedAt: null,
    createdAt: at,
  };
  const record: IdentityRecord = { ...input.record, currentVersion: next, updatedAt: at };
  return { record, version, bundle: toBundle(record, version) };
}

/** Guard every version write path: stored versions are append-only. */
export function assertVersionAppendOnly(existing: IdentityVersionRecord, candidateVersion: number): void {
  if (candidateVersion === existing.version) {
    throw new IdentityStoreError(
      "IDENTITY_IMMUTABLE_VERSION",
      `Identity version ${existing.version} is immutable; append a new version instead.`,
      { identityId: existing.identityId, version: existing.version },
    );
  }
}

export function toBundle(record: IdentityRecord, version: IdentityVersionRecord): IdentityBundle {
  if (!record.scope) {
    throw new IdentityStoreError("IDENTITY_VALIDATION", "Stock bundles resolve scope at use time, not at rest.");
  }
  return {
    identityId: record.identityId,
    version: version.version,
    scope: record.scope,
    kind: record.kind,
    origin: record.origin,
    contentHash: version.contentHash,
    consentGrantId: version.consentGrantId,
    revokedAt: version.revokedAt,
    createdAt: version.createdAt,
  };
}
