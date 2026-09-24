import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  isRealtimeTransportMode,
  RealtimeError,
  resolveRealtimeLimits,
} from "@ethen/studio-core/server/realtime";
import { resolveProjectScope, requireServiceClient } from "../../_lib/supabase-data";
import { countActiveSessions, insertEpoch, insertSession, listSessions } from "../../_lib/supabase-realtime";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import {
  fixtureCountActiveSessions,
  fixtureInsertSession,
  fixtureListSessions,
} from "../../_lib/realtime-lane";

export const dynamic = "force-dynamic";

function asRealtimeFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "Voice Agents need the Studio data service.");
  if (setup) return setup;
  if (error instanceof RealtimeError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
    if (error.code === "CONSENT_REQUIRED") return studioError("CONSENT_REQUIRED", error.message);
    if (error.code === "POLICY_DENIED") return studioError("MODERATION_BLOCKED", error.message);
    if (error.code === "QUOTA_EXCEEDED" || error.code === "RATE_LIMITED") return studioError("RATE_LIMITED", error.message);
    if (error.code === "ENDPOINT_UNAVAILABLE") return studioError("PROVIDER_UNAVAILABLE", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Realtime request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNonNegativeInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * STUDIO_16 — V1 realtime session collection. POST admits a session:
 * enrollment + concurrency + consent/retention gates, then reserve-before-
 * connect through the j04 hold (same quote id the estimate flow issued).
 * Transport attach happens on the token route; nothing connects here.
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
      const lane = localStores();
      return studioSuccess({ sessions: await fixtureListSessions(lane.realtime, lane.keys, resolved) });
    }
    return studioSuccess({ sessions: await listSessions(resolved) });
  } catch (error) {
    return asRealtimeFailure(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const authSession = await requireUserSession();
    if (authSession.response) return authSession.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const quoteId = asString(body.quoteId);
    const idempotencyKey = asString(body.idempotencyKey) ?? request.headers.get("Idempotency-Key");
    const transportMode = asString(body.transportMode);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!quoteId) return studioError("VALIDATION_ERROR", "quoteId (economics estimate) is required; reserve before connect.");
    if (!idempotencyKey) return studioError("VALIDATION_ERROR", "idempotencyKey is required.");
    if (!transportMode || !isRealtimeTransportMode(transportMode)) {
      return studioError("VALIDATION_ERROR", "transportMode must be explicitly \"pipeline\" or \"native\".");
    }
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const actorId = authorization.actorId ?? authSession.actorId;
    if (!actorId) return studioError("UNAUTHORIZED", "Authenticated actor is required.");
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const limits = resolveRealtimeLimits();
    const agent = (body.agent ?? {}) as Record<string, unknown>;
    const agentId = asString(agent["agentId"]);
    if (limits.enrollmentRequired && (!agentId || agentId.startsWith("demo-"))) {
      return studioError("FORBIDDEN", "Realtime sessions require an enrolled, project-owned voice agent.");
    }
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const active = lane ? await fixtureCountActiveSessions(lane.realtime, resolved) : await countActiveSessions(resolved);
    if (active >= limits.maxConcurrentSessionsPerProject) {
      return studioError("RATE_LIMITED", `Project has reached the maximum of ${limits.maxConcurrentSessionsPerProject} concurrent realtime sessions.`);
    }

    const spendCapIcu = asNonNegativeInt(body.spendCapIcu);
    const ceilingIcu = asNonNegativeInt(body.ceilingIcu);
    const rateIcuPerSecond = asNonNegativeInt(body.rateIcuPerSecond);
    if (spendCapIcu === null || spendCapIcu <= 0) return studioError("VALIDATION_ERROR", "spendCapIcu (positive integer ICU) is required.");
    if (ceilingIcu === null || ceilingIcu < spendCapIcu) {
      return studioError("VALIDATION_ERROR", "ceilingIcu must cover spendCapIcu.");
    }
    if (spendCapIcu > (limits.maxSpendIcuPerSession as number)) {
      return studioError("VALIDATION_ERROR", "Spend cap exceeds the per-session maximum.");
    }
    if (rateIcuPerSecond === null) return studioError("VALIDATION_ERROR", "rateIcuPerSecond (integer ICU) is required.");

    const recordingRetention = asString(body.recordingRetention) ?? "none";
    if (recordingRetention !== "none" && recordingRetention !== "session" && recordingRetention !== "project_default") {
      return studioError("VALIDATION_ERROR", "recordingRetention must be none, session, or project_default.");
    }
    const consentGrantId = typeof body.consentGrantId === "string" ? body.consentGrantId : null;
    if (recordingRetention !== "none" && !consentGrantId) {
      return studioError("CONSENT_REQUIRED", "Recording requires an explicit consent grant.");
    }
    const toolScopeIds = Array.isArray(body.toolScopeIds)
      ? body.toolScopeIds.filter((v): v is string => typeof v === "string")
      : [];
    const identityBindingId = typeof body.identityBindingId === "string" ? body.identityBindingId : null;

    const snapshot = {
      agentId,
      agentVersion: asString(agent["agentVersion"]) ?? "1",
      name: asString(agent["name"]) ?? "Voice Agent",
      provider: asString(agent["provider"]) ?? "managed",
      model: asString(agent["model"]) ?? "unknown",
      voiceBindingId: asString(agent["voiceBindingId"]) ?? "",
      instructionsHash: asString(agent["instructionsHash"]) ?? "",
      toolsHash: typeof agent["toolsHash"] === "string" ? agent["toolsHash"] : null,
      policyVersion: asString(agent["policyVersion"]) ?? "1.0",
      pricingVersion: asString(agent["pricingVersion"]) ?? "voice-v1",
      transportMode,
      capturedAt: new Date().toISOString(),
    };
    if (lane) {
      // Fixture lane: admit without the j04 money leg (no economics
      // locally). Transport attach stays provider-side (token route).
      const row = await fixtureInsertSession(lane.realtime, lane.keys, resolved, {
        agentSnapshot: snapshot as never,
        identityBindingId,
        spendCapIcu,
        ceilingIcu,
        rateIcuPerSecond,
        quoteId,
        toolScopeIds,
        consentGrantId,
        recordingRetention: recordingRetention as "none" | "session" | "project_default",
        idempotencyKey,
      });
      return studioSuccess({ session: row }, undefined, 201);
    }

    // Reserve BEFORE connect: the j04 hold is the admission transaction's
    // money leg. p_job_id carries the realtime session marker (text).
    const service = requireServiceClient();
    const { data: hold, error: holdError } = await service.rpc("studio_v5_allocate_hold", {
      p_project_id: resolved.projectId,
      p_tenant_id: resolved.tenantId,
      p_workspace_id: resolved.workspaceId,
      p_quote_id: quoteId,
      p_job_id: `realtime:${idempotencyKey}`,
      p_parent_reservation_id: null,
      p_idempotency_key: `realtime:${idempotencyKey}`,
      p_actor_id: actorId,
    });
    if (holdError) {
      return studioError("INSUFFICIENT_CREDITS", `Reservation failed: ${holdError.message}`);
    }
    const holdRow = (Array.isArray(hold) ? hold[0] : hold) as Record<string, unknown> | null;
    const reservationId = holdRow ? String(holdRow["reservation_id"] ?? "") : "";
    if (!reservationId) return studioError("INSUFFICIENT_CREDITS", "Reservation did not return a hold.");

    const row = await insertSession({
      scope: resolved,
      actorId,
      agentSnapshot: snapshot,
      identityBindingId,
      spendCapIcu,
      ceilingIcu,
      rateIcuPerSecond,
      reservationId,
      quoteId,
      reservedIcu: spendCapIcu,
      toolScopeIds,
      consentGrantId,
      recordingRetention,
      idempotencyKey,
    });
    await insertEpoch(resolved, row.sessionId, 1, null);
    return studioSuccess({ session: row }, undefined, 201);
  } catch (error) {
    return asRealtimeFailure(error);
  }
}
