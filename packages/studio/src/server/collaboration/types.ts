/**
 * Studio V5 collaboration — shared types and errors (STUDIO_18, server-only).
 *
 * Work libraries, jobs truth, review and collaboration over published
 * contracts: Platform membership (project_members roles), versioned
 * ReviewRequest pinning exact asset versions, comment/annotation,
 * event notification, and job/receipt read models. No new organization
 * silo, CRDT, or billing backend: membership authority stays Platform,
 * charges stay j04 receipts, execution stays j05.
 */
import "server-only";
import type { ApiErrorCode } from "../../contracts/errors";
import { studioError } from "../../contracts/errors";
import type { ProjectScope } from "../../contracts/scope";

/** Typed collaboration-layer failure carrying a kernel API error code. */
export class CollaborationError extends Error {
  readonly code: ApiErrorCode;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
    retryable = false,
  ) {
    super(message);
    this.name = "CollaborationError";
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }

  toApiError(requestId: string) {
    return studioError(this.code, this.message, requestId, this.retryable, this.details);
  }
}

export function collaborationError(
  code: ApiErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
  retryable = false,
): CollaborationError {
  return new CollaborationError(code, message, details, retryable);
}

/** HTTP status projection for CollaborationError codes (route adapters). */
export const COLLABORATION_ERROR_STATUS: Readonly<Record<ApiErrorCode, number>> = {
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

/** Platform membership role (project_members.role). Authority: Platform. */
export type PlatformRole = "owner" | "admin" | "member" | "viewer";

/** Studio working role mapped over Platform membership + reviewer grant. */
export type StudioRole = "viewer" | "creator" | "reviewer" | "admin";

export type CollaborationCapability =
  | "libraries.read"
  | "jobs.read"
  | "jobs.retry"
  | "jobs.cancel"
  | "review.request"
  | "review.decide"
  | "review.comment"
  | "links.manage"
  | "reviewers.manage"
  | "notifications.read";

/** One pinned asset version inside a review request. */
export interface PinnedAssetVersion {
  assetId: string;
  /** Exact durable asset version (j02); null only for legacy-need-review. */
  version: number | null;
  contentHash: string | null;
}

export type ReviewStatus =
  | "requested"
  | "approved"
  | "changes_requested"
  | "denied"
  | "cancelled"
  | "expired"
  | "invalidated";

/** Versioned review request: approvals pin exact asset versions. */
export interface ReviewRequest {
  reviewId: string;
  scope: ProjectScope;
  title: string;
  status: ReviewStatus;
  /** Schema version of this request envelope (starts at 1). */
  requestVersion: number;
  pinnedAssets: readonly PinnedAssetVersion[];
  requestedBy: string;
  decidedBy: string | null;
  feedback: string | null;
  /** Previous request this one supersedes (changes cycle), if any. */
  supersedesReviewId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Point annotation on an asset (normalized 0..1 coords + optional time). */
export interface AssetAnnotation {
  assetId: string;
  x: number;
  y: number;
  /** Media timestamp in seconds, for time-based media. */
  t: number | null;
  label: string | null;
}

export interface ReviewComment {
  commentId: string;
  reviewId: string;
  scope: ProjectScope;
  authorId: string;
  body: string;
  annotation: AssetAnnotation | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type PublicLinkOrigin = "collaboration" | "legacy-review-link";

export interface PublicReviewLink {
  linkId: string;
  scope: ProjectScope;
  reviewId: string | null;
  /** SHA-256 hex of the bearer token; the token itself is never stored. */
  tokenHash: string;
  assetIds: readonly string[];
  note: string;
  expiresAt: string;
  revokedAt: string | null;
  createdBy: string;
  origin: PublicLinkOrigin;
  legacyLinkId: string | null;
  createdAt: string;
}

export type NotificationKind =
  | "review.requested"
  | "review.decided"
  | "review.invalidated"
  | "review.commented"
  | "review.mentioned"
  | "job.completed"
  | "job.failed";

export interface StudioNotification {
  notificationId: string;
  scope: ProjectScope;
  userId: string;
  kind: NotificationKind;
  /** Idempotency/dedupe key: one unread row per (user, key). */
  dedupeKey: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Minimal structural job row consumed from the j05 read model. */
export interface TruthJobRow {
  jobId: string;
  taskName: string;
  status: string;
  quoteId: string;
  reservationId: string | null;
  endpointId: string;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TruthAttemptRow {
  attemptId: string;
  attemptNumber: number;
  phase: string;
  status: string;
  submitAmbiguous: boolean;
  lastError: string | null;
  createdAt: string;
}

/** Minimal structural receipt row consumed from the j04 read model. */
export interface TruthReceiptRow {
  receiptId: string;
  reservationId: string;
  jobId: string | null;
  estimatedIcu: number;
  chargedIcu: number;
  releasedIcu: number;
  absorbedProviderIcu: number;
  reconcilingChildren: readonly string[];
  settledAt: string;
}

/** Canonical jobs-truth projection for one job. */
export interface JobTruthView {
  job: TruthJobRow;
  stageLabel: string;
  terminal: boolean;
  attempts: readonly TruthAttemptRow[];
  attemptCount: number;
  ambiguousAttempt: boolean;
  receipt: TruthReceiptRow | null;
  /** Child job ids still reconciling under this job's receipt. */
  reconcilingChildren: readonly string[];
  /** Failed children that still incurred charges (never $0-silenced). */
  failedChildrenWithCharges: readonly { jobId: string; chargedIcu: number }[];
  totalChargedIcu: number;
  retry: { kind: "linked_attempt" | "new_run" | "forbidden"; reason: string };
  cancellable: boolean;
}

/** Scoped library search: tenant+project bound, never global. */
export interface LibrarySearchScope {
  scope: ProjectScope;
  query: string;
  kinds: readonly string[];
  limit: number;
}

export type BulkAssetAction = "add-to-review" | "download" | "delete";

export interface BulkActionDecision {
  action: BulkAssetAction;
  allowed: boolean;
  reason: string | null;
}
