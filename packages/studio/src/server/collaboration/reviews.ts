/**
 * Studio V5 collaboration — versioned review requests (STUDIO_18).
 *
 * A request pins exact asset versions (id + version + content hash). Any
 * asset edit afterwards invalidates the review: approval of a stale
 * request is refused and the author starts a new request (which
 * supersedes the old one) instead of mutating history. Imported reviews
 * without exact versions are marked needing a new review.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { collaborationError } from "./types";
import { assertCapability } from "./roles";
import type {
  PinnedAssetVersion,
  ReviewRequest,
  ReviewStatus,
  StudioRole,
} from "./types";
import type { ProjectScope } from "../../contracts/scope";

export const REVIEW_REQUEST_VERSION = 1;

function assertScope(scope: ProjectScope, owner: ProjectScope, noun: string): void {
  if (scope.tenantId !== owner.tenantId || scope.projectId !== owner.projectId) {
    throw collaborationError("FORBIDDEN", `${noun} belongs to another project scope.`);
  }
}

function normalizePin(pin: PinnedAssetVersion): PinnedAssetVersion {
  if (!pin.assetId.trim()) throw collaborationError("BAD_REQUEST", "Pinned assets need an asset id.");
  if (pin.version !== null && (!Number.isInteger(pin.version) || pin.version <= 0)) {
    throw collaborationError("BAD_REQUEST", "Pinned asset versions must be positive integers.");
  }
  return { assetId: pin.assetId, version: pin.version, contentHash: pin.contentHash };
}

export function requestReview(input: {
  scope: ProjectScope;
  role: StudioRole;
  actorId: string;
  title: string;
  pinnedAssets: readonly PinnedAssetVersion[];
  supersedesReviewId?: string | null;
  expiresAt?: string | null;
  idEmitted?: string;
  now: string;
}): ReviewRequest {
  assertCapability(input.role, "review.request");
  if (!input.actorId.trim()) throw collaborationError("BAD_REQUEST", "Requester identity is required.");
  if (!input.title.trim()) throw collaborationError("BAD_REQUEST", "Review title is required.");
  if (input.pinnedAssets.length === 0) {
    throw collaborationError("BAD_REQUEST", "Review needs at least one pinned asset.");
  }
  const seen = new Set<string>();
  for (const pin of input.pinnedAssets) {
    if (seen.has(pin.assetId)) throw collaborationError("BAD_REQUEST", `Asset pinned twice: ${pin.assetId}.`);
    seen.add(pin.assetId);
  }
  return {
    reviewId: input.idEmitted ?? randomUUID(),
    scope: input.scope,
    title: input.title.trim(),
    status: "requested",
    requestVersion: REVIEW_REQUEST_VERSION,
    pinnedAssets: input.pinnedAssets.map(normalizePin),
    requestedBy: input.actorId,
    decidedBy: null,
    feedback: null,
    supersedesReviewId: input.supersedesReviewId ?? null,
    expiresAt: input.expiresAt ?? null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export type ReviewValidity =
  | { valid: true }
  | { valid: false; reason: string; staleAssets: readonly string[] };

/**
 * Check a request against current asset versions. A changed version or
 * hash, a removed asset, or a missing pin (legacy import without exact
 * versions) invalidates the review.
 */
export function checkReviewValidity(
  review: ReviewRequest,
  scope: ProjectScope,
  currentAssets: ReadonlyMap<string, { version: number; contentHash: string | null }>,
): ReviewValidity {
  assertScope(scope, review.scope, "Review");
  if (review.status !== "requested" && review.status !== "approved") {
    return {
      valid: false,
      reason: `Review is ${review.status}; a new review request is required.`,
      staleAssets: [],
    };
  }
  const missing = review.pinnedAssets.filter((pin) => pin.version === null).map((pin) => pin.assetId);
  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Imported without exact asset versions (${missing.join(", ")}); needs a new review.`,
      staleAssets: missing,
    };
  }
  const stale: string[] = [];
  for (const pin of review.pinnedAssets) {
    const current = currentAssets.get(pin.assetId);
    if (!current) {
      stale.push(pin.assetId);
      continue;
    }
    if (current.version !== pin.version) {
      stale.push(pin.assetId);
      continue;
    }
    if (pin.contentHash && current.contentHash && current.contentHash !== pin.contentHash) {
      stale.push(pin.assetId);
    }
  }
  if (stale.length > 0) {
    return {
      valid: false,
      reason: `Asset edits invalidated the review: ${stale.join(", ")}.`,
      staleAssets: stale,
    };
  }
  return { valid: true };
}

export type ReviewDecision = "approved" | "changes_requested" | "denied";

export function decideReview(input: {
  review: ReviewRequest;
  scope: ProjectScope;
  role: StudioRole;
  actorId: string;
  decision: ReviewDecision;
  feedback?: string | null;
  currentAssets: ReadonlyMap<string, { version: number; contentHash: string | null }>;
  now: string;
}): ReviewRequest {
  assertScope(input.scope, input.review.scope, "Review");
  assertCapability(input.role, "review.decide");
  if (input.review.status !== "requested") {
    throw collaborationError(
      "CONFLICT",
      `Review is ${input.review.status}; only a requested review can be decided.`,
    );
  }
  if (!input.actorId.trim()) throw collaborationError("BAD_REQUEST", "Reviewer identity is required.");
  const feedback = input.feedback?.trim() ? input.feedback.trim() : null;
  if ((input.decision === "denied" || input.decision === "changes_requested") && !feedback) {
    throw collaborationError("BAD_REQUEST", "Declined reviews need feedback for the next revision.");
  }
  if (input.decision === "approved") {
    const validity = checkReviewValidity(input.review, input.scope, input.currentAssets);
    if (!validity.valid) {
      throw collaborationError("CONFLICT", `Cannot approve a stale review: ${validity.reason}`);
    }
  }
  const status: ReviewStatus = input.decision;
  return { ...input.review, status, decidedBy: input.actorId, feedback, updatedAt: input.now };
}

export function cancelReview(input: {
  review: ReviewRequest;
  scope: ProjectScope;
  role: StudioRole;
  actorId: string;
  now: string;
}): ReviewRequest {
  assertScope(input.scope, input.review.scope, "Review");
  if (input.review.status !== "requested") {
    throw collaborationError(
      "CONFLICT",
      `Review is ${input.review.status}; only a requested review can be cancelled.`,
    );
  }
  // The requester or an admin may cancel; reviewers decide, they don't cancel.
  if (input.review.requestedBy !== input.actorId) {
    assertCapability(input.role, "links.manage");
  }
  return { ...input.review, status: "cancelled", updatedAt: input.now };
}

/** Expire an overdue requested review. Returns the transition or null. */
export function expireReview(review: ReviewRequest, now: string): ReviewRequest | null {
  if (review.status !== "requested" || !review.expiresAt) return null;
  if (Date.parse(review.expiresAt) > Date.parse(now)) return null;
  return { ...review, status: "expired", updatedAt: now };
}

/** Mark a requested/approved review invalidated after an asset change. */
export function invalidateReview(
  review: ReviewRequest,
  scope: ProjectScope,
  currentAssets: ReadonlyMap<string, { version: number; contentHash: string | null }>,
  now: string,
): ReviewRequest | null {
  if (review.status !== "requested" && review.status !== "approved") return null;
  const validity = checkReviewValidity(review, scope, currentAssets);
  if (validity.valid) return null;
  return { ...review, status: "invalidated", feedback: validity.reason, updatedAt: now };
}

/** Start the changes cycle: a fresh request superseding a decided one. */
export function rerequestReview(input: {
  prior: ReviewRequest;
  scope: ProjectScope;
  role: StudioRole;
  actorId: string;
  title: string;
  pinnedAssets: readonly PinnedAssetVersion[];
  now: string;
}): ReviewRequest {
  assertScope(input.scope, input.prior.scope, "Review");
  if (input.prior.status === "requested") {
    throw collaborationError("CONFLICT", "A requested review is already open; decide or cancel it first.");
  }
  return requestReview({ ...input, supersedesReviewId: input.prior.reviewId });
}

/** Human label for a review status (UI surfaces). */
export function reviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    case "denied":
      return "Denied";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    case "invalidated":
      return "Invalidated — new review needed";
  }
}
