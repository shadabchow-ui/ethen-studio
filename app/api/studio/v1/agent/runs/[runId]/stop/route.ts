import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { AgentError } from "@ethen/studio-core/server/agent";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { appendAgentEvent, getAgentRun, nextAgentEventSeq, updateAgentRun } from "../../../../_lib/supabase-agent";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureStop } from "../../../../_lib/agent-lane";

export const dynamic = "force-dynamic";

function asAgentFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The Creative Agent needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof AgentError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Agent request failed.");
}

/** STUDIO_17 — visible stop from any live stage. Terminals reject the stop. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { runId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId : null;
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const run = fixtureStop(localStores().agent, resolved, runId, authorization.actorId ?? "unknown", new Date().toISOString());
      return studioSuccess({ run });
    }
    const run = await getAgentRun(resolved, runId);
    if (!run) return studioError("NOT_FOUND", "Agent run was not found.");
    if (["COMPLETED", "PUBLISHED", "STOPPED", "FAILED", "BLOCKED"].includes(run.stage)) {
      return studioError("CONFLICT", `Agent run is terminal (${run.stage}); no further transitions.`);
    }
    const actorId = authorization.actorId ?? "unknown";
    const updated = await updateAgentRun(resolved, runId, { stage: "STOPPED", stopped_by: actorId });
    await appendAgentEvent({
      runId,
      seq: await nextAgentEventSeq(runId),
      type: "run.stopped",
      stage: "STOPPED",
      payload: { stoppedBy: actorId, from: run.stage },
    });
    return studioSuccess({ run: updated });
  } catch (error) {
    return asAgentFailure(error);
  }
}
