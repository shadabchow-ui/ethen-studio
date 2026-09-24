/** Studio V5 data — records, envelopes, errors (STUDIO_02, server-only). */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { AssetKind } from "../../contracts/assets";
import type { ProjectScope } from "../../contracts/scope";

/** Project extension record over canonical public.projects IDs. */
export interface ProjectRecord {
  projectId: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  revision: number;
  isDefault: boolean;
  settings: Readonly<Record<string, unknown>>;
  createdAt: string;
  updatedAt: string;
}

/** Logical asset item. Versions are immutable; see contracts/assets. */
export interface AssetRecord {
  assetId: string;
  scope: ProjectScope;
  filename: string;
  kind: AssetKind;
  revision: number;
  tombstonedAt: string | null;
  /** Retained after tombstone: deletion never erases the receipt. */
  receipt: AssetReceipt | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetReceipt {
  assetId: string;
  scope: ProjectScope;
  finalVersion: number;
  finalSha256: string;
  finalByteSize: number;
  tombstonedAt: string;
  reason: string;
}

/** Cursor page envelope shared by list/search queries. */
export interface Page<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface SearchEnvelope<T> extends Page<T> {
  query: string;
  truncated: boolean;
}

/** Authorized media descriptor: IDs + storage key, never a provider URL. */
export interface MediaDescriptor {
  assetId: string;
  version: number;
  scope: ProjectScope;
  kind: AssetKind;
  filename: string;
  storageKey: string;
  sha256: string;
  byteSize: number;
  mediaMetadata: Readonly<Record<string, unknown>>;
  processingState: string;
}

/** Legacy backfill mapping entry. */
export type BackfillStatus = "mapped" | "orphan" | "conflict" | "quarantined";

export interface BackfillEntry {
  legacyTable: string;
  legacyId: string;
  status: BackfillStatus;
  assetId: string | null;
  detail: string;
}

export interface BackfillReport {
  mapped: number;
  replayed: number;
  orphans: number;
  conflicts: number;
  quarantined: number;
  entries: readonly BackfillEntry[];
}

/** Typed data-layer failure carrying a kernel API error code. */
export class DataError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ApiErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "DataError";
    this.code = code;
    this.details = details;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, false, this.details);
  }
}

export function dataError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): DataError {
  return new DataError(code, message, details);
}

/** HTTP status projection for DataError codes (route adapters). */
export const DATA_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_REVISION: 409,
  QUOTE_EXPIRED: 410,
  APPROVAL_REQUIRED: 403,
  QUOTA_EXCEEDED: 429,
  POLICY_DENIED: 403,
  CONSENT_REQUIRED: 403,
  ENDPOINT_UNAVAILABLE: 503,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};
