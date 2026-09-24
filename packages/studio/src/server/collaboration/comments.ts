/**
 * Studio V5 collaboration — review comments and annotations (STUDIO_18).
 *
 * Comments attach to a review with an optional point annotation on one of
 * the pinned assets. Comments are append-only (resolve, never delete);
 * annotations must reference a pinned asset with normalized coordinates.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { collaborationError } from "./types";
import { assertCapability } from "./roles";
import type { AssetAnnotation, ReviewComment, ReviewRequest, StudioRole } from "./types";
import type { ProjectScope } from "../../contracts/scope";

function assertScope(scope: ProjectScope, owner: ProjectScope, noun: string): void {
  if (scope.tenantId !== owner.tenantId || scope.projectId !== owner.projectId) {
    throw collaborationError("FORBIDDEN", `${noun} belongs to another project scope.`);
  }
}

export function normalizeAnnotation(
  review: ReviewRequest,
  annotation: AssetAnnotation | null,
): AssetAnnotation | null {
  if (!annotation) return null;
  const pinned = review.pinnedAssets.some((pin) => pin.assetId === annotation.assetId);
  if (!pinned) {
    throw collaborationError("BAD_REQUEST", "Annotations must reference an asset pinned by the review.");
  }
  for (const [name, value] of [["x", annotation.x], ["y", annotation.y]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw collaborationError("BAD_REQUEST", `Annotation ${name} must be within 0..1.`);
    }
  }
  if (annotation.t !== null && (!Number.isFinite(annotation.t) || annotation.t < 0)) {
    throw collaborationError("BAD_REQUEST", "Annotation timestamp must be a non-negative second count.");
  }
  return {
    assetId: annotation.assetId,
    x: annotation.x,
    y: annotation.y,
    t: annotation.t,
    label: annotation.label?.trim() ? annotation.label.trim() : null,
  };
}

export function addComment(input: {
  review: ReviewRequest;
  scope: ProjectScope;
  role: StudioRole;
  actorId: string;
  body: string;
  annotation?: AssetAnnotation | null;
  idEmitted?: string;
  now: string;
}): ReviewComment {
  assertScope(input.scope, input.review.scope, "Review");
  assertCapability(input.role, "review.comment");
  if (!input.actorId.trim()) throw collaborationError("BAD_REQUEST", "Author identity is required.");
  if (!input.body.trim()) throw collaborationError("BAD_REQUEST", "Comment body is required.");
  if (input.body.length > 4000) throw collaborationError("BAD_REQUEST", "Comment body exceeds 4000 characters.");
  if (input.review.status === "cancelled") {
    throw collaborationError("CONFLICT", "Cancelled reviews are closed to new comments.");
  }
  return {
    commentId: input.idEmitted ?? randomUUID(),
    reviewId: input.review.reviewId,
    scope: input.scope,
    authorId: input.actorId,
    body: input.body.trim(),
    annotation: normalizeAnnotation(input.review, input.annotation ?? null),
    resolvedAt: null,
    createdAt: input.now,
  };
}

/** Resolve a comment thread. Resolution is one-way; rows are never deleted. */
export function resolveComment(input: {
  comment: ReviewComment;
  scope: ProjectScope;
  role: StudioRole;
  now: string;
}): ReviewComment {
  assertScope(input.scope, input.comment.scope, "Comment");
  assertCapability(input.role, "review.comment");
  if (input.comment.resolvedAt) return input.comment;
  return { ...input.comment, resolvedAt: input.now };
}
