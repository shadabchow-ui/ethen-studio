import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, markRead } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../../../_lib/collaboration-auth";
import { listNotifications, markNotificationRead } from "../../../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureListNotifications,
  fixtureMarkNotificationRead,
} from "../../../../_lib/collaboration-lane";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) {
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Mark-read failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_18 — V1 mark-read. Recipients mark their own notifications;
 * cross-recipient marks are forbidden, never silently dropped.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ notificationId: string }> },
): Promise<Response> {
  try {
    const { notificationId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved, actorId } = auth.context;
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const mine = (lane
      ? await fixtureListNotifications(lane.collaboration, resolved, actorId)
      : await listNotifications(resolved, actorId)
    ).find((row) => row.notificationId === notificationId);
    if (!mine) return studioError("NOT_FOUND", "Notification was not found.");
    const now = new Date().toISOString();
    const marked = markRead({ notification: mine, userId: actorId, now });
    const persisted = lane
      ? await fixtureMarkNotificationRead(lane.collaboration, resolved, actorId, notificationId, marked.readAt ?? now)
      : await markNotificationRead(resolved, actorId, notificationId, marked.readAt ?? now);
    if (!persisted) return studioError("NOT_FOUND", "Notification was not found.");
    return studioSuccess({ notificationId, readAt: marked.readAt });
  } catch (error) {
    return asFailure(error);
  }
}
