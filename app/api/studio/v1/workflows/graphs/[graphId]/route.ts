import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { WorkflowExecutionError } from "@ethen/studio-core/server/workflow";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { listGraphRevisions } from "../../../_lib/supabase-workflow";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import { fixtureGetWorkspace, WorkflowLaneError } from "../../../_lib/workflow-lane";

export const dynamic = "force-dynamic";

function asLaneFailure(error: unknown): Response | null {
  if (error instanceof WorkflowLaneError) {
    if (error.code === "CONFLICT") return studioError("CONFLICT", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    return studioError("VALIDATION_ERROR", error.message);
  }
  return null;
}

/** STUDIO_13 — V1 graph workspace payload: head authoring graph + revision history. */
export async function GET(request: NextRequest, context: { params: Promise<{ graphId: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { graphId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const workspace = fixtureGetWorkspace(localStores().workflow, resolved, graphId);
      return studioSuccess({ graph: workspace.graph, revisions: workspace.revisions });
    }
    const { graph, revisions } = await listGraphRevisions(resolved, graphId);
    if (!graph) return studioError("NOT_FOUND", "Graph not found in this project.");
    return studioSuccess({ graph, revisions });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Workflows need the Studio data service.");
    if (setup) return setup;
    const lane = asLaneFailure(error);
    if (lane) return lane;
    if (error instanceof WorkflowExecutionError) return studioError("NOT_FOUND", error.message);
    return studioError("INTERNAL_ERROR", "Graph workspace failed.");
  }
}
