/** Studio V5 policy — records, requests, errors (STUDIO_03, server-only). */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { TaskName } from "../../contracts/tasks";
import type { PolicyAction } from "../../contracts/policy";
import type { ProjectScope } from "../../contracts/scope";

/** Append-only consent lifecycle. `unknown` = legacy import awaiting re-verification. */
export type ConsentStatus = "active" | "revoked" | "expired" | "needs_review" | "unknown";

export type ConsentProvenance =
  | "studio_v5"
  | "voice_legacy"
  | "voice_v2"
  | "studio_legacy"
  | "imported_unknown";

export type ConsentVerification = "user_declared" | "platform_verified" | "unknown";

/**
 * Append-only consent grant. Rows are never updated or deleted: revocation is
 * a separate event, expiry is derived, and re-verification appends a new
 * grant that supersedes the old one.
 */
export interface ConsentGrant {
  grantId: string;
  scope: ProjectScope;
  /** Identity (voice/character/product/brand) this grant covers. */
  identityId: string;
  /** Exact identity version covered, or null for unversioned legacy imports. */
  identityVersion: number | null;
  actorId: string;
  subjectRef: string;
  purpose: string;
  operations: readonly string[];
  channels: readonly string[];
  commercialScope: string;
  geography: readonly string[];
  allowedProviders: readonly string[];
  termsVersion: string;
  verificationState: ConsentVerification;
  status: ConsentStatus;
  provenance: ConsentProvenance;
  legacyRef: string | null;
  /** Previous grant this row supersedes (re-verification chain). */
  supersedes: string | null;
  grantedAt: string;
  expiresAt: string | null;
  payloadHash: string | null;
}

export interface ConsentGrantInput {
  identityId: string;
  identityVersion?: number | null;
  actorId: string;
  subjectRef: string;
  purpose: string;
  operations: readonly string[];
  channels?: readonly string[];
  commercialScope?: string;
  geography?: readonly string[];
  allowedProviders?: readonly string[];
  termsVersion: string;
  verificationState?: ConsentVerification;
  expiresAt?: string | null;
  payloadHash?: string | null;
  supersedes?: string | null;
}

/** Append-only revocation event. Provider obligations stay pending until confirmed. */
export interface ConsentRevocation {
  revocationId: string;
  grantId: string;
  scope: ProjectScope;
  identityId: string;
  revokedAt: string;
  reason: string;
  actorId: string;
  providerObligations: readonly string[];
  obligationsStatus: "pending_external" | "confirmed" | "not_applicable";
}

export type RightsStatus = "cleared" | "blocked" | "unknown" | "preview_only";

export type PolicyAssetClass =
  | "image"
  | "video"
  | "audio"
  | "music"
  | "transcript"
  | "document"
  | "package";

/**
 * Rights assertion for an asset (or asset version). `unknown` blocks
 * download/share/publish; `preview_only` additionally allows private preview.
 * Commercial permission is never inferred — it must be asserted.
 */
export interface RightsAssertion {
  assertionId: string;
  scope: ProjectScope;
  assetId: string;
  assetVersion: number | null;
  assetClass: PolicyAssetClass;
  status: RightsStatus;
  commercialUse: boolean | null;
  exportAllowed: boolean | null;
  channels: readonly string[];
  licenseRef: string | null;
  assertedBy: string;
  assertedAt: string;
  expiresAt: string | null;
  provenance: ConsentProvenance;
  note: string | null;
}

export interface RightsAssertionInput {
  assetId: string;
  assetVersion?: number | null;
  assetClass: PolicyAssetClass;
  status: RightsStatus;
  commercialUse?: boolean | null;
  exportAllowed?: boolean | null;
  channels?: readonly string[];
  licenseRef?: string | null;
  assertedBy: string;
  expiresAt?: string | null;
  provenance?: ConsentProvenance;
  note?: string | null;
}

/**
 * Scoped publish authority: workspace + channel + asset class + expiry + use
 * limit. Never workspace-wide implicit permission.
 */
export interface PublishAuthority {
  authorityId: string;
  scope: ProjectScope;
  channel: string;
  assetClass: PolicyAssetClass | "*";
  grantedBy: string;
  grantedTo: string;
  grantedAt: string;
  expiresAt: string;
  maxUses: number | null;
  usedCount: number;
  revokedAt: string | null;
  limits: Readonly<Record<string, unknown>>;
}

export interface PublishAuthorityInput {
  channel: string;
  assetClass: PolicyAssetClass | "*";
  grantedBy: string;
  grantedTo: string;
  expiresAt: string;
  maxUses?: number | null;
  limits?: Readonly<Record<string, unknown>>;
}

export type StudioRole = "viewer" | "creator" | "reviewer" | "admin";

export interface PolicyActor {
  actorId: string;
  roles: readonly StudioRole[];
}

export interface PolicyDestination {
  channel: string | null;
  region: string | null;
  /** SHA-256 of a review-link token, when presenting one. Never the token. */
  reviewTokenHash: string | null;
}

/** Content review is one independent axis — it never implies rights or spend. */
export interface ContentReviewInput {
  state: "requested" | "approved" | "denied" | "expired" | "cancelled" | "none";
  /** Asset/timeline/workflow version the approval pins. */
  pinnedVersion: string | null;
  /** Version currently being delivered; mismatch invalidates approval. */
  currentVersion: string | null;
}

/** Spend authorization is one independent axis — it never implies rights. */
export interface SpendApprovalInput {
  approved: boolean;
  approvalId: string | null;
  capIcu: number | null;
}

/**
 * Policy evaluation request. Binds actor + identity/version + task +
 * destination so every generate/export/download/share/publish decision is
 * reproducible from evidence.
 */
export interface PolicyRequest {
  scope: ProjectScope;
  actor: PolicyActor;
  task: TaskName;
  action: PolicyAction;
  identityId: string | null;
  identityVersion: number | null;
  assetId: string | null;
  assetVersion: number | null;
  assetClass: PolicyAssetClass | null;
  destination: PolicyDestination | null;
  contentReview: ContentReviewInput | null;
  spendApproval: SpendApprovalInput | null;
  /** Test clock override (ISO timestamp). Defaults to now. */
  now?: string;
}

/** Single-use delivery capability: every download needs a fresh decision. */
export interface DeliveryGrant {
  grantId: string;
  scope: ProjectScope;
  assetId: string;
  assetVersion: number;
  grantedTo: string;
  grantedAt: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  decisionId: string;
}

export class PolicyError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: ApiErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = "PolicyError";
    this.code = code;
    this.details = details;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, false, this.details);
  }
}

export function policyError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): PolicyError {
  return new PolicyError(code, message, details);
}

/** HTTP status projection for PolicyError codes (route adapters). */
export const POLICY_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
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
