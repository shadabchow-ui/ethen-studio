import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { IdentityError, recordRecentView } from "../../_lib/supabase-identity";
import { isStudioFixtureLane } from "../../_lib/local-lane";
import { getMemoryIdentityRepository } from "../../_lib/memory-identity";

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** STUDIO_10 — V1 identity recents adapter. Records one viewed identity; idempotent. */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const actorId = authorization.actorId ?? session.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const identityId = asString(body.identityId);
    if (!identityId) return studioError("VALIDATION_ERROR", "identityId is required.");
    if (await isStudioFixtureLane()) {
      // Matches the Supabase path: unknown identities record silently.
      getMemoryIdentityRepository().recordRecent({ scope: resolved.scope, actorId, identityId });
      return studioSuccess({ identityId, recorded: true });
    }
    await recordRecentView(resolved, actorId, identityId);
    return studioSuccess({ identityId, recorded: true });
  } catch (error) {
    if (error instanceof IdentityError) return studioError(error.status, error.message);
    const setup = setupRequiredResponse(error, "Identities need the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", "Recent recording failed.");
  }
}
