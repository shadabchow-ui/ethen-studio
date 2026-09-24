import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { AgentError } from "@ethen/studio-core/server/agent";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import {
  getAgentRun,
  listAgentApprovals,
  listAgentEvents,
  listAgentPatches,
  listAgentPlans,
} from "../../../_lib/supabase-agent";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import { fixtureGetRunDetail } from "../../../_lib/agent-lane";

export const dynamic = "force-dynamic";

function asAgentFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The Creative Agent needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof AgentError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Agent request failed.");
}

/** STUDIO_17 — V1 agent run detail: run + plans + patches + approvals + events. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { runId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess(fixtureGetRunDetail(localStores().agent, resolved, runId));
    }
    const run = await getAgentRun(resolved, runId);
    if (!run) return studioError("NOT_FOUND", "Agent run was not found.");
    const [plans, patches, approvals, events] = await Promise.all([
      listAgentPlans(resolved, runId),
      listAgentPatches(resolved, runId),
      listAgentApprovals(resolved, runId),
      listAgentEvents(resolved, runId),
    ]);
    return studioSuccess({ run, plans, patches, approvals, events });
  } catch (error) {
    return asAgentFailure(error);
  }
}
