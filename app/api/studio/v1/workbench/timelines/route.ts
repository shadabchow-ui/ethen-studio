import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  WorkbenchError,
  createTimelineRevision,
} from "@ethen/studio-core/server/workbench";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { appendTimelineRevision, insertTimeline, listTimelineHeads } from "../../_lib/supabase-workbench";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureAppendTimelineRevision, fixtureListTimelineHeads } from "../../_lib/workbench-lane";

export const dynamic = "force-dynamic";

function asWorkbenchFailure(error: unknown): Response {
  const setup = setupRequiredResponse(error, "The Pro workbench needs the Studio data service.");
  if (setup) return setup;
  if (error instanceof WorkbenchError) {
    if (error.code === "BAD_REQUEST") return studioError("VALIDATION_ERROR", error.message);
    if (error.code === "NOT_FOUND") return studioError("NOT_FOUND", error.message);
    if (error.code === "FORBIDDEN") return studioError("FORBIDDEN", error.message);
    if (error.code === "CONFLICT" || error.code === "STALE_REVISION") return studioError("CONFLICT", error.message);
  }
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Workbench request failed.");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * STUDIO_14 — V1 timeline collection. POST creates a timeline head plus
 * immutable revision 1 through the kernel recipe (structural validation);
 * GET lists heads. No raw recipe hash is trusted from the caller.
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
      return studioSuccess({ timelines: fixtureListTimelineHeads(localStores().workbench, resolved) });
    }
    return studioSuccess({ timelines: await listTimelineHeads(resolved) });
  } catch (error) {
    return asWorkbenchFailure(error);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    const title = asString(body.title);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!title) return studioError("VALIDATION_ERROR", "title is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const timescale = asPositiveInt(body.timescale) ?? 1_000_000;
    const fpsNum = asPositiveInt((body.fps as Record<string, unknown> | undefined)?.num) ?? 30;
    const fpsDen = asPositiveInt((body.fps as Record<string, unknown> | undefined)?.den) ?? 1;
    const revision = createTimelineRevision({
      scope: resolved.scope,
      title,
      timebase: { timescale },
      fps: { num: fpsNum, den: fpsDen },
    });
    if (await isStudioFixtureLane()) {
      const lane = localStores().workbench;
      const stored = fixtureAppendTimelineRevision(lane, resolved, revision);
      return studioSuccess(
        {
          timelineId: revision.timelineId,
          revision: stored.revision,
          revisionId: stored.revisionId,
          hash: stored.recipeHash,
          head: {
            timelineId: revision.timelineId,
            tenantId: resolved.tenantId,
            projectId: resolved.projectId,
            title: revision.title,
            timescale,
            fpsNum,
            fpsDen,
            headRevision: stored.revision,
            lockedBy: revision.lockedBy,
            updatedAt: stored.createdAt,
          },
        },
        crypto.randomUUID(),
        201,
      );
    }
    const head = await insertTimeline({
      scope: resolved,
      title: revision.title,
      timescale,
      fpsNum,
      fpsDen,
    });
    const stored = await appendTimelineRevision({
      scope: resolved,
      timelineId: head.timelineId,
      expectedParent: 0,
      revision: revision.revision,
      recipe: { tracks: revision.tracks, captionTracks: revision.captionTracks },
      recipeHash: revision.hash,
      actorId: null,
    });
    return studioSuccess(
      {
        timelineId: head.timelineId,
        revision: stored.revision,
        revisionId: stored.revisionId,
        hash: stored.recipeHash,
        head,
      },
      crypto.randomUUID(),
      201,
    );
  } catch (error) {
    return asWorkbenchFailure(error);
  }
}
