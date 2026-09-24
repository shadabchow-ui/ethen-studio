import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, addComment, notify } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../../../_lib/collaboration-auth";
import {
  getReview,
  insertComment,
  insertNotification,
  listComments,
} from "../../../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureGetReview,
  fixtureInsertComment,
  fixtureInsertNotification,
  fixtureListComments,
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
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Comment request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_18 — V1 review comments. GET reads the project-scoped thread;
 * POST appends a comment with an optional point annotation on a pinned
 * asset. The requester gets a deduped in-app notification.
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
      return studioSuccess({ comments: await fixtureListComments(lane.collaboration, resolved, reviewId) });
    }
    const review = await getReview(resolved, reviewId);
    if (!review) return studioError("NOT_FOUND", "Review was not found in this project.");
    return studioSuccess({ comments: await listComments(resolved, reviewId) });
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
    const fixture = await isStudioFixtureLane();
    const lane = fixture ? localStores() : null;
    const review = lane
      ? await fixtureGetReview(lane.collaboration, resolved, reviewId)
      : await getReview(resolved, reviewId);
    if (!review) return studioError("NOT_FOUND", "Review was not found in this project.");
    const raw = (body.annotation ?? null) as Record<string, unknown> | null;
    const now = new Date().toISOString();
    const comment = addComment({
      review,
      scope: resolved.scope,
      role,
      actorId,
      body: asString(body.body) ?? "",
      annotation: raw
        ? {
            assetId: String(raw["assetId"] ?? ""),
            x: Number(raw["x"] ?? Number.NaN),
            y: Number(raw["y"] ?? Number.NaN),
            t: typeof raw["t"] === "number" ? (raw["t"] as number) : null,
            label: typeof raw["label"] === "string" ? (raw["label"] as string) : null,
          }
        : null,
      now,
    });
    if (lane) {
      await fixtureInsertComment(lane.collaboration, comment);
      if (review.requestedBy !== actorId) {
        await fixtureInsertNotification(lane.collaboration, notify({
          scope: resolved.scope,
          userId: review.requestedBy,
          kind: "review.commented",
          subjectId: comment.commentId,
          title: `New comment on ${review.title}`,
          body: comment.annotation ? `Annotated ${comment.annotation.assetId}.` : comment.body.slice(0, 140),
          href: `/studio/work/reviews?projectId=${encodeURIComponent(projectId ?? "")}&reviewId=${encodeURIComponent(reviewId)}`,
          now,
        }));
      }
      return studioSuccess({ comment }, undefined, 201);
    }
    await insertComment({ scope: resolved, comment });
    if (review.requestedBy !== actorId) {
      await insertNotification({
        scope: resolved,
        notification: notify({
          scope: resolved.scope,
          userId: review.requestedBy,
          kind: "review.commented",
          subjectId: comment.commentId,
          title: `New comment on ${review.title}`,
          body: comment.annotation ? `Annotated ${comment.annotation.assetId}.` : comment.body.slice(0, 140),
          href: `/studio/work/reviews?projectId=${encodeURIComponent(projectId ?? "")}&reviewId=${encodeURIComponent(reviewId)}`,
          now,
        }),
      });
    }
    return studioSuccess({ comment }, undefined, 201);
  } catch (error) {
    return asFailure(error);
  }
}
