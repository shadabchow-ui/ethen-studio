/**
 * Studio V5 composites — review handoff (STUDIO_15).
 * Approval pins exact variant payload hashes and the brief revision.
 * Any variant edit or brief change afterwards invalidates the approval:
 * the campaign needs a new review request. Content review stays
 * independent from rights clearance and spend authorization.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { compositeError, type CampaignReview, type CampaignVariant } from "./types";

export function pinVariantHashes(variants: readonly CampaignVariant[]): Record<string, string> {
  const pinned: Record<string, string> = {};
  for (const variant of variants) pinned[variant.variantId] = variant.payloadHash;
  return pinned;
}

export function requestCampaignReview(input: {
  campaignId: string;
  scope: CampaignVariant["scope"];
  variants: readonly CampaignVariant[];
  briefRevision: number;
  expiresAt: string | null;
  now: string;
}): CampaignReview {
  if (input.variants.length === 0) {
    throw compositeError("BAD_REQUEST", "Review needs at least one variant.");
  }
  return {
    reviewId: randomUUID(),
    campaignId: input.campaignId,
    scope: input.scope,
    status: "requested",
    pinnedVariants: pinVariantHashes(input.variants),
    briefRevision: input.briefRevision,
    decidedBy: null,
    feedback: null,
    expiresAt: input.expiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export type ReviewValidity =
  | { valid: true }
  | { valid: false; reason: string; staleVariants: readonly string[] };

/** Check a review against current variant hashes + brief revision. */
export function checkReviewValidity(
  review: CampaignReview,
  currentVariants: readonly CampaignVariant[],
  currentBriefRevision: number,
): ReviewValidity {
  if (review.status !== "approved" && review.status !== "requested") {
    return { valid: false, reason: `Review is ${review.status}; a new review request is required.`, staleVariants: [] };
  }
  if (currentBriefRevision !== review.briefRevision) {
    return {
      valid: false,
      reason: `Brief changed (r${review.briefRevision} → r${currentBriefRevision}); approval is invalidated.`,
      staleVariants: [],
    };
  }
  const stale = currentVariants
    .filter((v) => review.pinnedVariants[v.variantId] !== v.payloadHash)
    .map((v) => v.variantId);
  const removed = Object.keys(review.pinnedVariants).filter(
    (variantId) => !currentVariants.some((v) => v.variantId === variantId),
  );
  const allStale = [...stale, ...removed];
  if (allStale.length > 0) {
    return {
      valid: false,
      reason: `Variant edits invalidated the review: ${allStale.join(", ")}.`,
      staleVariants: allStale,
    };
  }
  return { valid: true };
}

export function decideCampaignReview(
  review: CampaignReview,
  decision: "approved" | "denied",
  decidedBy: string,
  feedback: string | null,
  currentVariants: readonly CampaignVariant[],
  currentBriefRevision: number,
  now: string,
): CampaignReview {
  if (review.status !== "requested") {
    throw compositeError("CONFLICT", `Review is ${review.status}; only a requested review can be decided.`);
  }
  if (!decidedBy.trim()) throw compositeError("BAD_REQUEST", "Reviewer identity is required.");
  if (decision === "denied" && !feedback?.trim()) {
    throw compositeError("BAD_REQUEST", "Denied reviews need feedback for the next revision.");
  }
  if (decision === "approved") {
    const validity = checkReviewValidity(review, currentVariants, currentBriefRevision);
    if (!validity.valid) {
      throw compositeError("CONFLICT", `Cannot approve a stale review: ${validity.reason}`);
    }
  }
  return { ...review, status: decision, decidedBy, feedback, updatedAt: now };
}

export function cancelCampaignReview(review: CampaignReview, now: string): CampaignReview {
  if (review.status !== "requested") {
    throw compositeError("CONFLICT", `Review is ${review.status}; only a requested review can be cancelled.`);
  }
  return { ...review, status: "cancelled", updatedAt: now };
}

/** Expire overdue requested reviews. Returns the transitioned review or null. */
export function expireCampaignReview(review: CampaignReview, now: string): CampaignReview | null {
  if (review.status !== "requested" || !review.expiresAt) return null;
  if (Date.parse(review.expiresAt) > Date.parse(now)) return null;
  return { ...review, status: "expired", updatedAt: now };
}
