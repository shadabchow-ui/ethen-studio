import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { asIcu, subIcu } from "@ethen/studio-core/contracts";
import { connectedSeconds, RealtimeError, settleForSeconds } from "@ethen/studio-core/server/realtime";
import { resolveProjectScope, requireServiceClient } from "../../../_lib/supabase-data";
import { getSession, listEvents, listIntervals, listToolCalls, rpcStop } from "../../../_lib/supabase-realtime";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import {
  fixtureGetSession,
  fixtureListEvents,
  fixtureListIntervals,
  fixtureListToolCalls,
  fixtureStopSession,
} from "../../../_lib/realtime-lane";

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
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Realtime session request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_16 — V1 realtime session detail. GET returns the session head with
 * intervals, a read-only metering projection (connected seconds + projected
 * ICU, never a settlement), events and tool calls. DELETE stops the session:
 * meter, settle through j04 (which releases the remainder), then the atomic
 * realtime-side stop guard.
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
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const session = lane
      ? await fixtureGetSession(lane.realtime, lane.keys, resolved, sessionId)
      : await getSession(resolved, sessionId);
    if (!session) return studioError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
    const [intervals, events, tools] = lane
      ? await Promise.all([
        fixtureListIntervals(lane.realtime, resolved, sessionId),
        fixtureListEvents(lane.realtime, resolved, sessionId),
        fixtureListToolCalls(lane.realtime, resolved, sessionId),
      ])
      : await Promise.all([
        listIntervals(resolved, sessionId),
        listEvents(resolved, sessionId),
        listToolCalls(resolved, sessionId),
      ]);
    const now = new Date().toISOString();
    const seconds = connectedSeconds(
      intervals.map((i) => ({ intervalId: i.intervalId, sessionId: i.sessionId, epoch: i.epoch, startedAt: i.startedAt, endedAt: i.endedAt })),
      now,
    );
    const { usedIcu, capped } = settleForSeconds(seconds, asIcu(session.rateIcuPerSecond), asIcu(session.spendCapIcu));
    return studioSuccess({
      session,
      intervals,
      events,
      tools,
      metering: { connectedSeconds: seconds, projectedIcu: usedIcu as number, atCap: capped, asOf: now },
    });
  } catch (error) {
    return asRealtimeFailure(error);
  }
}

export async function DELETE(
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
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const session = lane
      ? await fixtureGetSession(lane.realtime, lane.keys, resolved, sessionId)
      : await getSession(resolved, sessionId);
    if (!session) return studioError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);
    if (session.status === "ENDED" || session.status === "REVOKED" || session.status === "ERRORED") {
      return studioSuccess({ session, metering: null, alreadyTerminal: true });
    }
    const now = new Date().toISOString();
    const intervals = lane
      ? await fixtureListIntervals(lane.realtime, resolved, sessionId)
      : await listIntervals(resolved, sessionId);
    const seconds = connectedSeconds(
      intervals.map((i) => ({ intervalId: i.intervalId, sessionId: i.sessionId, epoch: i.epoch, startedAt: i.startedAt, endedAt: i.endedAt })),
      now,
    );
    const { usedIcu } = settleForSeconds(seconds, asIcu(session.rateIcuPerSecond), asIcu(session.spendCapIcu));
    void subIcu;

    if (lane) {
      // Fixture lane: no reservation exists (admit skipped the money leg),
      // so stop locally after metering — no settlement to run.
      const stopped = await fixtureStopSession(lane.realtime, resolved, sessionId, now, usedIcu as number);
      const next = await fixtureGetSession(lane.realtime, lane.keys, resolved, sessionId);
      return studioSuccess({
        session: next,
        metering: { connectedSeconds: seconds, settledIcu: stopped.spentIcu, releasedIcu: session.reservedIcu - stopped.spentIcu },
      });
    }

    // Settle metered use through j04 under the admit hold key; the settle
    // writes the remainder release itself (settled rows are terminal, so no
    // separate release call follows).
    const service = requireServiceClient();
    if (session.reservationId) {
      const { error: settleError } = await service.rpc("studio_v5_settle_reservation", {
        p_project_id: resolved.projectId,
        p_idempotency_key: `realtime:${session.idempotencyKey}`,
        p_actual_icu: usedIcu as number,
        p_provider_minor: 0,
        p_minor_per_icu: 1,
        p_provider_id: "realtime",
        p_evidence_hash: sessionId,
      });
      if (settleError) {
        return studioError("INTERNAL_ERROR", `Settlement failed: ${settleError.message}`);
      }
    }
    const stopped = await rpcStop(sessionId, "stopped", now, usedIcu as number);
    const next = await getSession(resolved, sessionId);
    return studioSuccess({
      session: next,
      metering: { connectedSeconds: seconds, settledIcu: stopped.spentIcu, releasedIcu: session.reservedIcu - stopped.spentIcu },
    });
  } catch (error) {
    return asRealtimeFailure(error);
  }
}
