import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  CompositeError,
  checkReviewValidity,
  decideCampaignReview,
  pinVariantHashes,
} from "@ethen/studio-core/server/composites";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { decideReviewRow, getCampaign, insertReview, listReviews, listVariants } from "../../../../_lib/supabase-composites";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureDecideCampaignReview,
  fixtureGetCampaign,
  fixtureListReviews,
  fixtureRequestCampaignReview,
} from "../../../../_lib/composites-lane";

export const dynamic = "force-dynamic";

function asCompositeFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Campaigns need the Studio data service.");
  if (setup) return setup;
  if (error instanceof CompositeError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Composites request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_15 — V1 campaign review handoff. POST without reviewId requests a
 * review (pins current variant hashes); POST with reviewId + decision
 * approves/denies after revalidating pins. Edits invalidate approvals.
 * Export-first: approval enables rights-cleared export, never auto-posting.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ campaignId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { campaignId } = await context.params;
    const projectId = asString(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({ reviews: fixtureListReviews(localStores().composites, resolved, campaignId) });
    }
    return studioSuccess({ reviews: await listReviews(resolved, campaignId) });
  } catch (error) {
    return asCompositeFailure(error);
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { campaignId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const lane = (await isStudioFixtureLane()) ? localStores().composites : null;
    const campaign = lane ? fixtureGetCampaign(lane, resolved, campaignId) : await getCampaign(resolved, campaignId);
    if (!campaign) return studioError("NOT_FOUND", "Campaign was not found.");
    if (lane) {
      const reviewId = asString(body.reviewId);
      if (!reviewId) {
        const review = fixtureRequestCampaignReview(lane, resolved, campaignId, asString(body.expiresAt));
        return studioSuccess({ review }, undefined, 201);
      }
      const decision = asString(body.decision);
      if (decision !== "approved" && decision !== "denied") {
        return studioError("VALIDATION_ERROR", "decision must be approved or denied.");
      }
      const decided = fixtureDecideCampaignReview(
        lane,
        resolved,
        campaignId,
        reviewId,
        decision,
        authorization.actorId ?? "unknown",
        asString(body.feedback),
      );
      return studioSuccess({ review: decided });
    }
    const variants = await listVariants(resolved, campaignId);
    if (variants.length === 0) return studioError("VALIDATION_ERROR", "Review needs at least one variant.");

    const reviewId = asString(body.reviewId);
    if (!reviewId) {
      const expiresAt = asString(body.expiresAt);
      const review = await insertReview({
        campaignId,
        pinnedVariants: pinVariantHashes(
          variants.map((v) => ({
            variantId: v.variantId,
            payloadHash: v.payloadHash,
          })) as never,
        ),
        briefRevision: campaign.briefRevision,
        expiresAt,
      });
      return studioSuccess({ review }, undefined, 201);
    }

    const decision = asString(body.decision);
    if (decision !== "approved" && decision !== "denied") {
      return studioError("VALIDATION_ERROR", "decision must be approved or denied.");
    }
    const reviews = await listReviews(resolved, campaignId);
    const review = reviews.find((r) => r.reviewId === reviewId);
    if (!review) return studioError("NOT_FOUND", "Review was not found.");
    const decided = decideCampaignReview(
      {
        reviewId: review.reviewId,
        campaignId: review.campaignId,
        scope: resolved.scope,
        status: review.status as "requested",
        pinnedVariants: review.pinnedVariants,
        briefRevision: review.briefRevision,
        decidedBy: review.decidedBy,
        feedback: review.feedback,
        expiresAt: review.expiresAt,
        createdAt: review.updatedAt,
        updatedAt: review.updatedAt,
      },
      decision,
      authorization.actorId ?? "unknown",
      asString(body.feedback),
      variants.map((v) => ({ variantId: v.variantId, payloadHash: v.payloadHash })) as never,
      campaign.briefRevision,
      new Date().toISOString(),
    );
    const saved = await decideReviewRow(reviewId, decision, decided.decidedBy ?? "unknown", decided.feedback);
    const validity = checkReviewValidity(
      { ...decided, status: saved.status as "approved" | "requested" },
      variants.map((v) => ({ variantId: v.variantId, payloadHash: v.payloadHash })) as never,
      campaign.briefRevision,
    );
    void validity;
    return studioSuccess({ review: saved });
  } catch (error) {
    return asCompositeFailure(error);
  }
}
