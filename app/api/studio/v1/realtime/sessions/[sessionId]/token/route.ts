import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { StudioSetupError, setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  isRealtimeTransportMode,
  mintTransportCredential,
  RealtimeError,
} from "@ethen/studio-core/server/realtime";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import {
  closeOpenIntervals,
  getSession,
  insertEpoch,
  openInterval,
  storeCredential,
  updateSessionStatus,
} from "../../../../_lib/supabase-realtime";
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
    if (error.code === "ENDPOINT_UNAVAILABLE") return studioError("PROVIDER_UNAVAILABLE", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Transport request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_16 — V1 realtime transport control. POST {action}:
 * connect (STARTING→ACTIVE, mint epoch credential, open interval),
 * disconnect (ACTIVE→RECONNECTING, close interval — gap unbilled),
 * reconnect (RECONNECTING→ACTIVE on a fresh epoch).
 * Credentials absent yields closed readiness, never an invented token.
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
    const action = asString(body.action);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (action !== "connect" && action !== "disconnect" && action !== "reconnect") {
      return studioError("VALIDATION_ERROR", "action must be connect, disconnect, or reconnect.");
    }
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      // Transport attach needs a live realtime provider, which the
      // fixture tier never runs. Session admit/list/edit still work.
      const providerSetup = setupRequiredResponse(new StudioSetupError("provider"), "Live voice needs a realtime provider.");
      if (providerSetup) return providerSetup;
    }
    const session = await getSession(resolved, sessionId);
    if (!session) return studioError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);

    const now = new Date().toISOString();
    if (action === "disconnect") {
      if (session.status !== "ACTIVE") return studioError("CONFLICT", `Session is ${session.status}; only ACTIVE sessions disconnect.`);
      await closeOpenIntervals(resolved, sessionId, now);
      const next = await updateSessionStatus(resolved, sessionId, { status: "RECONNECTING" });
      return studioSuccess({ session: next, credential: null });
    }

    const transportMode = asString(body.transportMode);
    if (!transportMode || !isRealtimeTransportMode(transportMode)) {
      return studioError("VALIDATION_ERROR", "transportMode must be explicitly \"pipeline\" or \"native\".");
    }
    const pinned = typeof session.agentSnapshot["transportMode"] === "string"
      ? String(session.agentSnapshot["transportMode"])
      : null;
    if (pinned && pinned !== transportMode) {
      return studioError("CONFLICT", `Transport mode is pinned to "${pinned}"; silent switch refused.`);
    }
    if (!session.reservationId) {
      return studioError("CONFLICT", "Session has no reservation; reserve before connect.");
    }

    // Substrate readiness: managed LiveKit target requires credentials;
    // synthetic only when explicitly enabled for tests.
    const syntheticAllowed = process.env.STUDIO_REALTIME_SYNTHETIC === "1";
    const managedReady = Boolean(
      process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET && process.env.LIVEKIT_WS_URL,
    );
    const substrate = managedReady ? "livekit-managed" : syntheticAllowed ? "synthetic" : null;
    if (!substrate) {
      return studioError("PROVIDER_UNAVAILABLE", "Realtime media substrate is not configured; Voice Agents are unavailable.");
    }

    if (action === "connect") {
      if (session.status !== "STARTING") {
        return studioError("CONFLICT", `Session is ${session.status}; only STARTING sessions connect.`);
      }
      const credential = mintTransportCredential({
        session: {
          sessionId: session.sessionId,
          scope: resolved.scope,
          status: session.status as "STARTING",
          epoch: session.epoch,
          agentSnapshot: session.agentSnapshot as never,
          identityBindingId: session.identityBindingId,
          spendCapIcu: session.spendCapIcu as never,
          ceilingIcu: session.ceilingIcu as never,
          spentIcu: session.spentIcu as never,
          rateIcuPerSecond: session.rateIcuPerSecond as never,
          reservationId: session.reservationId,
          quoteId: session.quoteId,
          reservedIcu: session.reservedIcu as never,
          topupCount: session.topupCount,
          toolScopeIds: session.toolScopeIds,
          revokedScopeIds: session.revokedScopeIds,
          consentGrantId: session.consentGrantId,
          recordingRetention: session.recordingRetention as never,
          endReason: null,
          errorCode: null,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          endedAt: null,
        },
        substrate,
        existing: null,
        now,
      });
      const stored = await storeCredential({
        scope: resolved,
        sessionId,
        epoch: session.epoch,
        substrate,
        token: credential.token,
        expiresAt: credential.expiresAt,
      });
      await openInterval(resolved, sessionId, session.epoch);
      const next = await updateSessionStatus(resolved, sessionId, { status: "ACTIVE" });
      return studioSuccess({
        session: next,
        credential: { ...credential, credentialId: stored.credentialId },
      }, undefined, 201);
    }

    // reconnect
    if (session.status !== "RECONNECTING") {
      return studioError("CONFLICT", `Session is ${session.status}; only RECONNECTING sessions reconnect.`);
    }
    const epoch = session.epoch + 1;
    const credential = mintTransportCredential({
      session: {
        sessionId: session.sessionId,
        scope: resolved.scope,
        status: "RECONNECTING",
        epoch,
        agentSnapshot: session.agentSnapshot as never,
        identityBindingId: session.identityBindingId,
        spendCapIcu: session.spendCapIcu as never,
        ceilingIcu: session.ceilingIcu as never,
        spentIcu: session.spentIcu as never,
        rateIcuPerSecond: session.rateIcuPerSecond as never,
        reservationId: session.reservationId,
        quoteId: session.quoteId,
        reservedIcu: session.reservedIcu as never,
        topupCount: session.topupCount,
        toolScopeIds: session.toolScopeIds,
        revokedScopeIds: session.revokedScopeIds,
        consentGrantId: session.consentGrantId,
        recordingRetention: session.recordingRetention as never,
        endReason: null,
        errorCode: null,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        endedAt: null,
      },
      substrate,
      existing: null,
      now,
    });
    const stored = await storeCredential({
      scope: resolved,
      sessionId,
      epoch,
      substrate,
      token: credential.token,
      expiresAt: credential.expiresAt,
    });
    await insertEpoch(resolved, sessionId, epoch, stored.credentialId);
    await openInterval(resolved, sessionId, epoch);
    const next = await updateSessionStatus(resolved, sessionId, { status: "ACTIVE", epoch });
    return studioSuccess({
      session: next,
      credential: { ...credential, credentialId: stored.credentialId },
    }, undefined, 201);
  } catch (error) {
    return asRealtimeFailure(error);
  }
}
