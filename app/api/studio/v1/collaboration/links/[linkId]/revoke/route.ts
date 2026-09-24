import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { CollaborationError, revokePublicLink } from "@ethen/studio-core/server/collaboration";
import { resolveCollaborationContext } from "../../../../_lib/collaboration-auth";
import { getReview, listLinks, revokeLinkRow } from "../../../../_lib/supabase-collaboration";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureGetReview,
  fixtureListLinks,
  fixtureRevokeLink,
} from "../../../../_lib/collaboration-lane";

export const dynamic = "force-dynamic";

function asFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Collaboration needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof CollaborationError) {
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Revoke failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_18 — V1 link revocation. Immediate and permanent; the token
 * stops resolving on every surface. Admin only.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ linkId: string }> },
): Promise<Response> {
  try {
    const { linkId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const auth = await resolveCollaborationContext(projectId);
    if ("response" in auth) return auth.response;
    const { resolved, role } = auth.context;
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const links = lane ? await fixtureListLinks(lane.collaboration, resolved) : await listLinks(resolved);
    const link = links.find((row) => row.linkId === linkId) ?? null;
    if (!link) return studioError("NOT_FOUND", "Link was not found in this project.");
    if (link.reviewId) {
      const review = lane
        ? await fixtureGetReview(lane.collaboration, resolved, link.reviewId)
        : await getReview(resolved, link.reviewId);
      if (!review) return studioError("NOT_FOUND", "Link review was not found in this project.");
    }
    const now = new Date().toISOString();
    const revoked = revokePublicLink({ link, scope: resolved.scope, role, now });
    const persisted = lane
      ? await fixtureRevokeLink(lane.collaboration, resolved, linkId, revoked.revokedAt ?? now)
      : await revokeLinkRow(resolved, linkId, revoked.revokedAt ?? now);
    if (!persisted) return studioError("NOT_FOUND", "Link was not found in this project.");
    return studioSuccess({ linkId, revokedAt: revoked.revokedAt });
  } catch (error) {
    return asFailure(error);
  }
}
