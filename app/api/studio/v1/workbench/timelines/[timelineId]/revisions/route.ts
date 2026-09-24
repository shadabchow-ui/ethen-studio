import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  WorkbenchError,
  applyEditOp,
  type EditOp,
  type SourceProbe,
  type TimelineRevision,
} from "@ethen/studio-core/server/workbench";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { appendTimelineRevision, getTimelineHead, getTimelineRevision } from "../../../../_lib/supabase-workbench";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import {
  fixtureAppendTimelineRevision,
  fixtureGetTimelineHead,
  fixtureGetTimelineRevision,
} from "../../../../_lib/workbench-lane";

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
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Revision append failed.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * STUDIO_14 — V1 revision append. The caller names the expected parent
 * head and supplies one edit op plus measured source probes; the kernel
 * validates bounds/overlap/gain/captions and the row insert is CAS on
 * the stored head. Stale parents return CONFLICT, never silent rebase.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ timelineId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { timelineId } = await params;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId : null;
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const fixture = (await isStudioFixtureLane()) ? localStores().workbench : null;
    const head = fixture ? fixtureGetTimelineHead(fixture, resolved, timelineId) : await getTimelineHead(resolved, timelineId);
    if (!head) return studioError("NOT_FOUND", "Timeline is not in this project.");
    const expectedParent = typeof body.expectedParent === "number" ? body.expectedParent : NaN;
    if (!Number.isInteger(expectedParent) || expectedParent < 0) {
      return studioError("VALIDATION_ERROR", "expectedParent head revision is required.");
    }
    if (expectedParent !== head.headRevision) {
      return studioError("CONFLICT", "Timeline head moved; reload and reapply the edit.");
    }
    const op = asRecord(body.op);
    if (!op || typeof op.kind !== "string") return studioError("VALIDATION_ERROR", "Edit op is required.");
    const probes = Array.isArray(body.probes) ? (body.probes as SourceProbe[]) : [];
    const stored = fixture
      ? fixtureGetTimelineRevision(fixture, resolved, timelineId, head.headRevision)
      : await getTimelineRevision(resolved, timelineId, head.headRevision);
    if (!stored) return studioError("NOT_FOUND", "Timeline head revision is missing.");
    const recipe = asRecord(stored.recipe);
    if (!recipe || !Array.isArray(recipe.tracks) || !Array.isArray(recipe.captionTracks)) {
      return studioError("INTERNAL_ERROR", "Stored revision recipe is malformed.");
    }
    const parent: TimelineRevision = {
      revisionId: stored.revisionId,
      timelineId: head.timelineId,
      scope: resolved.scope,
      revision: stored.revision,
      parentRevision: stored.parentRevision,
      title: head.title,
      timebase: { timescale: head.timescale },
      fps: { num: head.fpsNum, den: head.fpsDen },
      tracks: recipe.tracks as TimelineRevision["tracks"],
      captionTracks: recipe.captionTracks as TimelineRevision["captionTracks"],
      hash: stored.recipeHash,
      createdAt: stored.createdAt,
      lockedBy: head.lockedBy,
    };
    const next = applyEditOp(parent, op as EditOp, probes, { actor: typeof body.actor === "string" ? body.actor : undefined });
    if (next.hash === parent.hash) return studioError("VALIDATION_ERROR", "Edit op produced no change.");
    const appended = fixture
      ? fixtureAppendTimelineRevision(fixture, resolved, next)
      : await appendTimelineRevision({
        scope: resolved,
        timelineId: head.timelineId,
        expectedParent: head.headRevision,
        revision: next.revision,
        recipe: { tracks: next.tracks, captionTracks: next.captionTracks },
        recipeHash: next.hash,
        actorId: null,
      });
    return studioSuccess(
      { timelineId: head.timelineId, revision: appended.revision, hash: appended.recipeHash },
      crypto.randomUUID(),
      201,
    );
  } catch (error) {
    return asWorkbenchFailure(error);
  }
}
