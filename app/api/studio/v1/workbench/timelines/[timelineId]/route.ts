import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { WorkbenchError } from "@ethen/studio-core/server/workbench";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { getTimelineHead, getTimelineRevision } from "../../../_lib/supabase-workbench";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import { fixtureGetTimelineHead, fixtureGetTimelineRevision } from "../../../_lib/workbench-lane";

export const dynamic = "force-dynamic";

/**
 * STUDIO_14 — V1 timeline head read. Returns the head revision recipe
 * plus timeline timebase/fps; revision history stays append-only.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ timelineId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { timelineId } = await params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!timelineId) return studioError("VALIDATION_ERROR", "timelineId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const lane = localStores().workbench;
      const head = fixtureGetTimelineHead(lane, resolved, timelineId);
      if (!head) return studioError("NOT_FOUND", "Timeline is not in this project.");
      if (head.headRevision <= 0) return studioSuccess({ head, revision: null });
      const revision = fixtureGetTimelineRevision(lane, resolved, timelineId, head.headRevision);
      if (!revision) return studioError("NOT_FOUND", "Timeline head revision is missing.");
      return studioSuccess({ head, revision });
    }
    const head = await getTimelineHead(resolved, timelineId);
    if (!head) return studioError("NOT_FOUND", "Timeline is not in this project.");
    if (head.headRevision <= 0) return studioSuccess({ head, revision: null });
    const revision = await getTimelineRevision(resolved, timelineId, head.headRevision);
    if (!revision) return studioError("NOT_FOUND", "Timeline head revision is missing.");
    return studioSuccess({ head, revision });
  } catch (error) {
    const setup = setupRequiredResponse(error, "The Pro workbench needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof WorkbenchError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", "Timeline read failed.");
  }
}
