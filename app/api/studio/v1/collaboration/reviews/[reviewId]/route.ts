import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, checkReviewValidity } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../../_lib/collaboration-auth";
import {
  currentAssetVersions,
  getReview,
  listComments,
} from "../../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import {
  fixtureGetReview,
  fixtureListComments,
  fixtureSnapshotFor,
} from "../../../_lib/collaboration-lane";
import { getAssetDetail } from "../../../_lib/supabase-data";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) {
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Review read failed.");
}

/**
 * STUDIO_18 — V1 review detail. Project-scoped request with live
 * validity against current asset versions plus its comment thread.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ reviewId: string }> },
): Promise<Response> {
  try {
    const { reviewId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved } = auth.context;
    if (await isStudioFixtureLane()) {
      const lane = localStores();
      const review = await fixtureGetReview(lane.collaboration, resolved, reviewId);
      if (!review) return studioError("NOT_FOUND", "Review was not found in this project.");
      const current = await fixtureSnapshotFor(
        (id) => getAssetDetail(resolved, id),
        review.pinnedAssets.map((pin) => pin.assetId),
      );
      const validity = checkReviewValidity(review, resolved.scope, current);
      const comments = await fixtureListComments(lane.collaboration, resolved, reviewId);
      return studioSuccess({
        review,
        validity: validity.valid
          ? { valid: true as const, reason: null, staleAssets: [] as string[] }
          : { valid: false as const, reason: validity.reason, staleAssets: [...validity.staleAssets] },
        comments,
      });
    }
    const review = await getReview(resolved, reviewId);
    if (!review) return studioError("NOT_FOUND", "Review was not found in this project.");
    const current = await currentAssetVersions(
      resolved,
      review.pinnedAssets.map((pin) => pin.assetId),
    );
    const validity = checkReviewValidity(review, resolved.scope, current);
    const comments = await listComments(resolved, reviewId);
    return studioSuccess({
      review,
      validity: validity.valid
        ? { valid: true as const, reason: null, staleAssets: [] as string[] }
        : { valid: false as const, reason: validity.reason, staleAssets: [...validity.staleAssets] },
      comments,
    });
  } catch (error) {
    return asFailure(error);
  }
}
