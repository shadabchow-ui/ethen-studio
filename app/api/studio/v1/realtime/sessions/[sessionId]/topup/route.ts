import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { StudioSetupError, setupRequiredResponse } from "@/lib/media/studio-setup";
import { RealtimeError } from "@ethen/studio-core/server/realtime";
import { resolveProjectScope, requireServiceClient } from "../../../../_lib/supabase-data";
import { getSession, rpcTopup } from "../../../../_lib/supabase-realtime";
import { isStudioFixtureLane } from "../../../../_lib/local-lane";

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
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Topup request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_16 — V1 realtime atomic topup. Raises the reservation toward the
 * authorized ceiling: j04 hold first (money leg), then the row-locked
 * realtime-side guard. Races serialize in SQL; the ceiling never yields.
 */
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
    const idempotencyKey = asString(body.idempotencyKey) ?? request.headers.get("Idempotency-Key");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    const requestedRaw = body.requestedIcu;
    const requestedIcu = typeof requestedRaw === "number" && Number.isInteger(requestedRaw) ? requestedRaw : -1;
    if (requestedIcu <= 0) return studioError("VALIDATION_ERROR", "requestedIcu must be a positive integer.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const actorId = authorization.actorId ?? authSession.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "Authenticated actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      // Topups need live economics plus a provider hold, neither of
      // which the fixture tier runs.
      const providerSetup = setupRequiredResponse(new StudioSetupError("provider"), "Voice topups need a live provider.");
      if (providerSetup) return providerSetup;
    }
    const session = await getSession(resolved, sessionId);
    if (!session) return studioError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
    if (!session.quoteId) return studioError("CONFLICT", "Session has no quote; topup is refused.");

    const service = requireServiceClient();
    const { error: holdError } = await service.rpc("studio_v5_allocate_hold", {
      p_project_id: resolved.projectId,
      p_tenant_id: resolved.tenantId,
      p_workspace_id: resolved.workspaceId,
      p_quote_id: session.quoteId,
      p_job_id: `realtime:${sessionId}:topup:${idempotencyKey}`,
      p_parent_reservation_id: session.reservationId,
      p_idempotency_key: `realtime:${sessionId}:topup:${idempotencyKey}`,
      p_actor_id: actorId,
    });
    if (holdError) {
      return studioError("INSUFFICIENT_CREDITS", `Topup hold failed: ${holdError.message}`);
    }
    const topup = await rpcTopup(sessionId, requestedIcu);
    const next = await getSession(resolved, sessionId);
    return studioSuccess({ session: next, topup });
  } catch (error) {
    return asRealtimeFailure(error);
  }
}
