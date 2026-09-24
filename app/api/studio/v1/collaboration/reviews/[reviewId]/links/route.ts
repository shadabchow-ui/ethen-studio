import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, createPublicLink } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../../../_lib/collaboration-auth";
import {
  getReview,
  insertLink,
  listLinks,
  redactLink,
} from "../../../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureGetReview,
  fixtureInsertLink,
  fixtureListLinks,
} from "../../../../_lib/collaboration-lane";

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
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Link request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_18 — V1 review links. GET lists redacted project links for the
 * review; POST mints a bearer token (returned once) scoped to pinned
 * assets. Admin only.
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
      const links = (await fixtureListLinks(lane.collaboration, resolved)).filter((link) => link.reviewId === reviewId);
      return studioSuccess({ links: links.map(redactLink) });
    }
    const review = await getReview(resolved, reviewId);
    if (!review) return studioError("NOT_FOUND", "Review was not found in this project.");
    const links = (await listLinks(resolved)).filter((link) => link.reviewId === reviewId);
    return studioSuccess({ links: links.map(redactLink) });
  } catch (error) {
    return asFailure(error);
  }
}

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
    const idempotencyKey = asString(body.idempotencyKey) ?? request.headers.get("Idempotency-Key");
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    const assetIds = Array.isArray(body.assetIds)
      ? (body.assetIds as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
      : review.pinnedAssets.map((pin) => pin.assetId);
    const ttlMs = typeof body.ttlMs === "number" ? body.ttlMs : 7 * 24 * 60 * 60 * 1000;
    const now = new Date().toISOString();
    const { link, token } = createPublicLink({
      scope: resolved.scope,
      role,
      actorId,
      review,
      assetIds,
      note: asString(body.note) ?? "",
      ttlMs,
      now,
    });
    if (lane) {
      await fixtureInsertLink(lane.collaboration, lane.keys, resolved, link, idempotencyKey);
    } else {
      await insertLink({ scope: resolved, link, idempotencyKey });
    }
    // The bearer token is returned once; only its hash is stored.
    return studioSuccess({ link: redactLink(link), token }, undefined, 201);
  } catch (error) {
    return asFailure(error);
  }
}
