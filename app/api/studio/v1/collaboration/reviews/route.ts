import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  CollaborationError,
  checkReviewValidity,
  requestReview,
} from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../_lib/collaboration-auth";
import {
  currentAssetVersions,
  insertReview,
  listReviews,
} from "../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import {
  fixtureInsertReview,
  fixtureListReviews,
  fixtureSnapshotFor,
} from "../../_lib/collaboration-lane";
import { getAssetDetail } from "../../_lib/supabase-data";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) {
    if (error.code === "BAD_REQUEST") {
      return studioError("VALIDATION_ERROR", error.message);
    }
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN" || error.code === "CONSENT_REQUIRED" || error.code === "POLICY_DENIED") {
      return studioError("FORBIDDEN", error.message);
    }
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Review request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_18 — V1 review collection. GET lists project-scoped requests
 * with live validity; POST pins exact asset versions into a new request
 * (idempotent per project key).
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved } = auth.context;
    if (await isStudioFixtureLane()) {
      const lane = localStores();
      const reviews = await fixtureListReviews(lane.collaboration, resolved);
      const assetIds = [...new Set(reviews.flatMap((review) => review.pinnedAssets.map((pin) => pin.assetId)))];
      const current = await fixtureSnapshotFor((id) => getAssetDetail(resolved, id), assetIds);
      return studioSuccess({
        reviews: reviews.map((review) => {
          const validity = checkReviewValidity(review, resolved.scope, current);
          return {
            ...review,
            validity: validity.valid ? { valid: true, reason: null } : { valid: false, reason: validity.reason },
          };
        }),
      });
    }
    const reviews = await listReviews(resolved);
    const assetIds = [...new Set(reviews.flatMap((review) => review.pinnedAssets.map((pin) => pin.assetId)))];
    const current = await currentAssetVersions(resolved, assetIds);
    return studioSuccess({
      reviews: reviews.map((review) => {
        const validity = checkReviewValidity(review, resolved.scope, current);
        return {
          ...review,
          validity: validity.valid ? { valid: true, reason: null } : { valid: false, reason: validity.reason },
        };
      }),
    });
  } catch (error) {
    return asFailure(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved, actorId, role } = auth.context;
    const title = asString(body.title);
    const idempotencyKey = asString(body.idempotencyKey) ?? request.headers.get("Idempotency-Key");
    const rawPins = Array.isArray(body.pinnedAssets) ? body.pinnedAssets : [];
    if (!title) return studioError("VALIDATION_ERROR", "title is required.");
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    const pins = rawPins.map((pin: Record<string, unknown>) => ({
      assetId: String(pin["assetId"] ?? ""),
      version: typeof pin["version"] === "number" ? (pin["version"] as number) : null,
      contentHash: typeof pin["contentHash"] === "string" ? (pin["contentHash"] as string) : null,
    }));
    const now = new Date().toISOString();
    const review = requestReview({
      scope: resolved.scope,
      role,
      actorId,
      title,
      pinnedAssets: pins,
      supersedesReviewId: asString(body.supersedesReviewId),
      expiresAt: asString(body.expiresAt),
      now,
    });
    if (await isStudioFixtureLane()) {
      const lane = localStores();
      const saved = await fixtureInsertReview(lane.collaboration, lane.keys, resolved, review, idempotencyKey);
      return studioSuccess({ review: saved }, undefined, 201);
    }
    const saved = await insertReview({ scope: resolved, review, idempotencyKey });
    return studioSuccess({ review: saved }, undefined, 201);
  } catch (error) {
    return asFailure(error);
  }
}
