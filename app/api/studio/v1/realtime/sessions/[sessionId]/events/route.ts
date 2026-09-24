import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { isRealtimeEventType, RealtimeError } from "@ethen/studio-core/server/realtime";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { findEventByProviderId, getSession, insertEvent, listEvents } from "../../../../_lib/supabase-realtime";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureFindEventByProviderId,
  fixtureGetSession,
  fixtureInsertEvent,
  fixtureListEvents,
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
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Event request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_16 — V1 realtime session events. POST appends with epoch replay
 * protection (stale epochs rejected) and provider-event dedupe (retries
 * acknowledged, never re-applied). GET lists the ordered stream.
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
      return studioSuccess({ events: await fixtureListEvents(lane.realtime, resolved, sessionId) });
    }
    return studioSuccess({ events: await listEvents(resolved, sessionId) });
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
    const type = asString(body.type);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!type || !isRealtimeEventType(type)) return studioError("VALIDATION_ERROR", "type must be a known realtime event type.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const lane = (await isStudioFixtureLane()) ? localStores() : null;
    const session = lane
      ? await fixtureGetSession(lane.realtime, lane.keys, resolved, sessionId)
      : await getSession(resolved, sessionId);
    if (!session) return studioError("NOT_FOUND", `Realtime session ${sessionId} was not found.`);

    const providerEventId = typeof body.providerEventId === "string" && body.providerEventId ? String(body.providerEventId) : null;
    if (providerEventId) {
      const duplicate = lane
        ? await fixtureFindEventByProviderId(lane.realtime, resolved, sessionId, providerEventId)
        : await findEventByProviderId(resolved, sessionId, providerEventId);
      if (duplicate) return studioSuccess({ event: duplicate, deduped: true });
    }
    const epochRaw = body.epoch;
    const epoch = typeof epochRaw === "number" && Number.isInteger(epochRaw) ? epochRaw : session.epoch;
    if (epoch < session.epoch) {
      return studioError("CONFLICT", `Stale epoch ${epoch}; session is at epoch ${session.epoch}.`);
    }
    if (epoch > session.epoch) {
      return studioError("CONFLICT", `Unknown future epoch ${epoch}; session is at epoch ${session.epoch}.`);
    }
    const text = typeof body.text === "string" ? String(body.text).slice(0, 4000) : "";
    const payload = body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
    const clientAt = typeof body.clientAt === "string" && body.clientAt ? String(body.clientAt) : new Date().toISOString();
    const { event, deduped } = lane
      ? await fixtureInsertEvent(lane.realtime, resolved, {
        sessionId,
        epoch,
        type,
        text,
        providerEventId,
        clientAt,
        payload,
      })
      : await insertEvent({
        scope: resolved,
        sessionId,
        epoch,
        type,
        text,
        providerEventId,
        clientAt,
        payload,
      });
    return studioSuccess({ event, deduped }, undefined, deduped ? 200 : 201);
  } catch (error) {
    return asRealtimeFailure(error);
  }
}
