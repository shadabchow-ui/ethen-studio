import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  CollaborationError,
  cancelReview,
  decideReview,
  notify,
} from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../../../_lib/collaboration-auth";
import {
  currentAssetVersions,
  getReview,
  insertNotification,
  updateReview,
} from "../../../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureGetReview,
  fixtureInsertNotification,
  fixtureSnapshotFor,
  fixtureUpdateReview,
} from "../../../../_lib/collaboration-lane";
import { getAssetDetail } from "../../../../_lib/supabase-data";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) {
    if (error.code === "BAD_REQUEST") {
      return studioError("VALIDATION_ERROR", error.message);
    }
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Review decision failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_18 — V1 review decision. Reviewer/admin approve (stale pins
 * refused), request changes, or deny; the requester or an admin may
 * cancel. The requester gets a deduped in-app notification.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  try {
    const { reviewId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved, actorId, role } = auth.context;
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const review = lane
      ? await fixtureGetReview(lane.collaboration, resolved, reviewId)
      : await getReview(resolved, reviewId);
    if (!review) return studioError("NOT_FOUND", "Review was not found in this project.");
    const action = asString(body.action) ?? "decide";
    const now = new Date().toISOString();
    if (action === "cancel") {
      const cancelled = cancelReview({ review, scope: resolved.scope, role, actorId, now });
      if (lane) await fixtureUpdateReview(lane.collaboration, cancelled);
      else await updateReview({ scope: resolved, review: cancelled });
      return studioSuccess({ review: cancelled });
    }
    const decision = asString(body.decision);
    if (decision !== "approved" && decision !== "changes_requested" && decision !== "denied") {
      return studioError("VALIDATION_ERROR", "decision must be approved, changes_requested, or denied.");
    }
    const current = lane
      ? await fixtureSnapshotFor(
          (id) => getAssetDetail(resolved, id),
          review.pinnedAssets.map((pin) => pin.assetId),
        )
      : await currentAssetVersions(
          resolved,
          review.pinnedAssets.map((pin) => pin.assetId),
        );
    const decided = decideReview({
      review,
      scope: resolved.scope,
      role,
      actorId,
      decision,
      feedback: asString(body.feedback),
      currentAssets: current,
      now,
    });
    if (lane) await fixtureUpdateReview(lane.collaboration, decided);
    else await updateReview({ scope: resolved, review: decided });
    if (review.requestedBy !== actorId) {
      const notification = notify({
        scope: resolved.scope,
        userId: review.requestedBy,
        kind: "review.decided",
        subjectId: decided.reviewId,
        title: `Review ${decided.status.replace("_", " ")}: ${decided.title}`,
        body: decided.feedback ?? `Decided by ${actorId}.`,
        href: `/studio/work/reviews?projectId=${encodeURIComponent(projectId ?? "")}&reviewId=${encodeURIComponent(decided.reviewId)}`,
        now,
      });
      if (lane) await fixtureInsertNotification(lane.collaboration, notification);
      else await insertNotification({ scope: resolved, notification });
    }
    return studioSuccess({ review: decided });
  } catch (error) {
    return asFailure(error);
  }
}
