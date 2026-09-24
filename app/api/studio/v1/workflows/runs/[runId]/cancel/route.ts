import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { WorkflowExecutionError } from "@ethen/studio-core/server/workflow";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { appendRunEvent, readRunProjection, updateRunStatus } from "../../../../_lib/supabase-workflow";
import { isStudioFixtureLane } from "../../../../_lib/local-lane";

export const dynamic = "force-dynamic";

/** STUDIO_13 — V1 run cancel: one envelope, settled children retained by the worker. */
export async function POST(request: NextRequest, context: { params: Promise<{ runId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { runId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId : request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    // P05 — fixture runs are never admitted (POST reports SETUP_REQUIRED/
    // temporal), so no run id can resolve on this lane.
    if (await isStudioFixtureLane()) return studioError("NOT_FOUND", "Run not found in this project.");
    const projection = await readRunProjection(resolved, runId);
    if (!projection) return studioError("NOT_FOUND", "Run not found in this project.");
    if (projection.status === "COMPLETED" || projection.status === "CANCELLED") {
      return studioSuccess({ status: projection.status });
    }
    const reason = typeof body.reason === "string" && body.reason.trim().length > 0 ? body.reason : "cancelled";
    await updateRunStatus(resolved, runId, "CANCEL_REQUESTED");
    await appendRunEvent({ scope: resolved, runId, type: "run.cancel_requested", nodeId: null, payload: { reason } });
    return studioSuccess({ status: "CANCEL_REQUESTED" });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    if (error instanceof WorkflowExecutionError) return studioError("NOT_FOUND", error.message);
    return studioError("INTERNAL_ERROR", "Run cancel failed.");
  }
}
