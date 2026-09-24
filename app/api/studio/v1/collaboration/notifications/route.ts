import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, unreadCount } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../_lib/collaboration-auth";
import { listNotifications } from "../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureListNotifications } from "../../_lib/collaboration-lane";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) return studioError("FORBIDDEN", error.message);
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Notification read failed.");
}

/**
 * STUDIO_18 — V1 notification center. Recipient-scoped: an actor reads
 * only their own project notifications, newest first.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const projectId = request.nextUrl.searchParams.get("projectId");
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved, actorId } = auth.context;
    const notifications = (await isStudioFixtureLane())
      ? await fixtureListNotifications(localStores().collaboration, resolved, actorId)
      : await listNotifications(resolved, actorId);
    return studioSuccess({ notifications, unread: unreadCount(notifications, actorId) });
  } catch (error) {
    return asFailure(error);
  }
}
