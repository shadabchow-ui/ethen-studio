import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, assertCapability } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../_lib/collaboration-auth";
import { grantReviewer, revokeReviewer } from "../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureGrantReviewer, fixtureRevokeReviewer } from "../../_lib/collaboration-lane";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) {
    if (error.code === "BAD_REQUEST") {
      return studioError("VALIDATION_ERROR", error.message);
    }
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Reviewer grant failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_18 — V1 reviewer grants. Admin-only mapping over Platform
 * membership: lifts a member to reviewer (grant) or drops the lift
 * (revoke). Grants never substitute for Platform membership.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved, actorId, role } = auth.context;
    assertCapability(role, "reviewers.manage");
    const userId = asString(body.userId);
    const action = asString(body.action) ?? "grant";
    if (!userId) return studioError("VALIDATION_ERROR", "userId is required.");
    if (await isStudioFixtureLane()) {
      const lane = localStores();
      if (action === "grant") {
        await fixtureGrantReviewer(lane.collaboration, resolved, userId, actorId);
        return studioSuccess({ userId, reviewer: true });
      }
      if (action === "revoke") {
        await fixtureRevokeReviewer(lane.collaboration, resolved, userId);
        return studioSuccess({ userId, reviewer: false });
      }
    } else {
      if (action === "grant") {
        await grantReviewer(resolved, userId, actorId);
        return studioSuccess({ userId, reviewer: true });
      }
      if (action === "revoke") {
        await revokeReviewer(resolved, userId);
        return studioSuccess({ userId, reviewer: false });
      }
    }
    return studioError("VALIDATION_ERROR", "action must be grant or revoke.");
  } catch (error) {
    return asFailure(error);
  }
}
