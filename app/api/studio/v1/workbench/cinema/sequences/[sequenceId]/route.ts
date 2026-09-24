import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { WorkbenchError } from "@ethen/studio-core/server/workbench";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { getEditorialSequenceDetail } from "../../../../_lib/supabase-workbench";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureGetSequenceDetail } from "../../../../_lib/workbench-lane";

export const dynamic = "force-dynamic";

/**
 * STUDIO_14 — V1 Cinema sequence detail: scenes plus editorial shots
 * with the renamed take binding (selected_take_id + canonical
 * selected_take_job_id). Reference layer only; no creative bytes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sequenceId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { sequenceId } = await params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!sequenceId) return studioError("VALIDATION_ERROR", "sequenceId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const detail = fixtureGetSequenceDetail(localStores().workbench, resolved, sequenceId);
      if (!detail) return studioError("NOT_FOUND", "Sequence is not in this project.");
      return studioSuccess(detail);
    }
    const detail = await getEditorialSequenceDetail(resolved, sequenceId);
    if (!detail) return studioError("NOT_FOUND", "Sequence is not in this project.");
    return studioSuccess(detail);
  } catch (error) {
    const setup = setupRequiredResponse(error, "Cinema needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof WorkbenchError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", "Sequence read failed.");
  }
}
