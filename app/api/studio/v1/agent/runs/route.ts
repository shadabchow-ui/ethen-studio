import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { AgentError } from "@ethen/studio-core/server/agent";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { appendAgentEvent, insertAgentRun, listAgentRuns, nextAgentEventSeq } from "../../_lib/supabase-agent";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureCreateRun, fixtureListRuns } from "../../_lib/agent-lane";

export const dynamic = "force-dynamic";

function asAgentFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The Creative Agent needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof AgentError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN" || error.code === "POLICY_DENIED" || error.code === "CONSENT_REQUIRED") {
      return studioError("FORBIDDEN", error.message);
    }
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
    if (error.code === "APPROVAL_REQUIRED") return studioError("APPROVAL_REQUIRED", error.message);
    if (error.code === "QUOTE_EXPIRED") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Agent request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNonNegativeInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * STUDIO_17 — V1 agent run collection. POST creates a plan-only run with a
 * platform-absorbed investigation ceiling; GET lists heads. Tier starts at
 * plan-only; only a human can raise it (advance route).
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const projectId = asString(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({ runs: fixtureListRuns(localStores().agent, resolved) });
    }
    return studioSuccess({ runs: await listAgentRuns(resolved) });
  } catch (error) {
    return asAgentFailure(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const title = asString(body.title);
    const brief = asString(body.brief);
    const idempotencyKey = asString(body.idempotencyKey) ?? request.headers.get("Idempotency-Key");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!title) return studioError("VALIDATION_ERROR", "title is required.");
    if (!brief) return studioError("VALIDATION_ERROR", "brief is required.");
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const internalCeilingIcu = asNonNegativeInt(body.internalCeilingIcu);
    if (internalCeilingIcu === null) {
      return studioError("VALIDATION_ERROR", "internalCeilingIcu (integer ICU) is required.");
    }
    if (await isStudioFixtureLane()) {
      const stores = localStores();
      const { run } = fixtureCreateRun(stores.agent, stores.keys.agentRuns, resolved, {
        title,
        brief,
        internalCeilingIcu,
        idempotencyKey,
        now: new Date().toISOString(),
      });
      return studioSuccess({ run }, undefined, 201);
    }
    const run = await insertAgentRun({
      scope: resolved,
      title,
      brief,
      internalCeilingIcu,
      idempotencyKey,
    });
    await appendAgentEvent({
      runId: run.runId,
      seq: await nextAgentEventSeq(run.runId),
      type: "run.created",
      stage: "INVESTIGATE",
      payload: { title },
    });
    return studioSuccess({ run }, undefined, 201);
  } catch (error) {
    return asAgentFailure(error);
  }
}
