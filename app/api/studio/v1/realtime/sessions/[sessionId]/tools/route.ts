import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { RealtimeError } from "@ethen/studio-core/server/realtime";
import { isTaskName } from "@ethen/studio-core/contracts";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { getSession, insertToolCall, listToolCalls, updateSessionStatus } from "../../../../_lib/supabase-realtime";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureGetSession,
  fixtureInsertToolCall,
  fixtureListToolCalls,
  fixtureUpdateSessionStatus,
} from "../../../../_lib/realtime-lane";

export const dynamic = "force-dynamic";

function asRealtimeFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Voice Agents need the Studio data service.");
  if (setup) return setup;
  if (error instanceof RealtimeError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Tool request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_16 — V1 realtime tool calls. POST records a tool request: revoked
 * scopes stop the session, unknown scopes are refused, and policy + approval
 * execute in the realtime plane through the kernel gateway (same task policy
 * as batch). GET lists the session's calls.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  try {
    const authSession = await requireUserSession();
    if (authSession.response) return authSession.response;
    const { sessionId } = await context.params;
    const projectId = asString(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const lane = localStores();
      return studioSuccess({ tools: await fixtureListToolCalls(lane.realtime, resolved, sessionId) });
    }
    return studioSuccess({ tools: await listToolCalls(resolved, sessionId) });
  } catch (error) {
    return asRealtimeFailure(error);
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  try {
    const authSession = await requireUserSession();
    if (authSession.response) return authSession.response;
    const { sessionId } = await context.params;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const task = asString(body.task);
    const toolName = asString(body.toolName);
    const toolScopeId = asString(body.toolScopeId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!task || !isTaskName(task)) return studioError("VALIDATION_ERROR", "task must be a canonical Studio task.");
    if (!toolName) return studioError("VALIDATION_ERROR", "toolName is required.");
    if (!toolScopeId) return studioError("VALIDATION_ERROR", "toolScopeId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const session = lane
      ? await fixtureGetSession(lane.realtime, lane.keys, resolved, sessionId)
      : await getSession(resolved, sessionId);
    if (!session) return studioError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
    if (session.status === "ENDED" || session.status === "REVOKED" || session.status === "ERRORED") {
      return studioError("CONFLICT", `Session is ${session.status}; tools are closed.`);
    }
    if (session.revokedScopeIds.includes(toolScopeId)) {
      if (lane) {
        await fixtureUpdateSessionStatus(lane.realtime, lane.keys, resolved, sessionId, { status: "REVOKED", endReason: "revoked", endedAt: new Date().toISOString() });
      } else {
        await updateSessionStatus(resolved, sessionId, { status: "REVOKED", endReason: "revoked", endedAt: new Date().toISOString() });
      }
      return studioError("FORBIDDEN", `Tool scope ${toolScopeId} is revoked; the session was stopped.`);
    }
    if (!session.toolScopeIds.includes(toolScopeId)) {
      return studioError("FORBIDDEN", `Tool scope ${toolScopeId} is not approved for this session.`);
    }
    const args = body.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : {};
    const requiresApproval = body.requiresApproval !== false;
    const callInput = {
      sessionId,
      epoch: session.epoch,
      task,
      toolName,
      toolScopeId,
      args,
      status: (requiresApproval ? "awaiting_approval" : "approved") as "awaiting_approval" | "approved",
      approvalId: null,
      decisionCode: requiresApproval ? "APPROVAL_PENDING" : "NO_APPROVAL_REQUIRED",
    };
    const call = lane
      ? await fixtureInsertToolCall(lane.realtime, resolved, callInput)
      : await insertToolCall({ scope: resolved, ...callInput });
    return studioSuccess({ tool: call }, undefined, 201);
  } catch (error) {
    return asRealtimeFailure(error);
  }
}
