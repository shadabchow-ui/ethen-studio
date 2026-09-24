import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { StudioSetupError, setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  WorkbenchError,
  buildRenderSubmission,
  type TimelineRevision,
} from "@ethen/studio-core/server/workbench";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { findRenderByKey, getTimelineHead, getTimelineRevision, insertRender } from "../../_lib/supabase-workbench";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureGetTimelineHead, fixtureGetTimelineRevision, fixtureSubmitRender } from "../../_lib/workbench-lane";

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
  return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Render submit failed.");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * STUDIO_14 — V1 deterministic render submission. The route resolves the
 * stored revision, builds the kernel submission envelope (task pin,
 * deterministic idempotency key, request hash) and replays same-key
 * submissions; a same-key/different-payload resubmit is a CONFLICT.
 * Durable execution stays with the shared runtime; rendering with j07.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId : null;
    const timelineId = typeof body.timelineId === "string" ? body.timelineId : null;
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!timelineId) return studioError("VALIDATION_ERROR", "timelineId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const fixture = (await isStudioFixtureLane()) ? localStores().workbench : null;
    const head = fixture ? fixtureGetTimelineHead(fixture, resolved, timelineId) : await getTimelineHead(resolved, timelineId);
    if (!head) return studioError("NOT_FOUND", "Timeline is not in this project.");
    const revisionNumber = typeof body.revision === "number" ? body.revision : head.headRevision;
    const stored = fixture
      ? fixtureGetTimelineRevision(fixture, resolved, timelineId, revisionNumber)
      : await getTimelineRevision(resolved, timelineId, revisionNumber);
    if (!stored) return studioError("NOT_FOUND", "Timeline revision is not in this project.");
    const recipe = asRecord(stored.recipe);
    if (!recipe || !Array.isArray(recipe.tracks) || !Array.isArray(recipe.captionTracks)) {
      return studioError("INTERNAL_ERROR", "Stored revision recipe is malformed.");
    }
    const revision: TimelineRevision = {
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
    const output = asRecord(body.output);
    if (!output) return studioError("VALIDATION_ERROR", "Render output spec is required.");
    const submission = buildRenderSubmission({
      scope: resolved.scope,
      revision,
      output: output as unknown as Parameters<typeof buildRenderSubmission>[0]["output"],
      interchange:
        body.interchange === "otio" || body.interchange === "fcpxml" || body.interchange === "none"
          ? body.interchange
          : "none",
      idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    });
    if (fixture) {
      // Fixture lane: record the submission (replay + conflict semantics
      // hold) but never execute — execution needs the Studio worker,
      // which the fixture tier does not run.
      fixtureSubmitRender(fixture, submission);
      const workerSetup = setupRequiredResponse(new StudioSetupError("worker"), "Timeline rendering needs the Studio worker.");
      if (workerSetup) return workerSetup;
    }
    const existing = await findRenderByKey(resolved, submission.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== submission.requestHash) {
        return studioError("CONFLICT", "Idempotency key reuse with a different render payload.");
      }
      return studioSuccess({ render: existing, replayed: true });
    }
    const created = await insertRender({
      scope: resolved,
      timelineId: submission.spec.timelineId,
      revision: submission.spec.revision,
      revisionHash: submission.spec.revisionHash,
      spec: { output: submission.spec.output, interchange: submission.spec.interchange },
      idempotencyKey: submission.idempotencyKey,
      requestHash: submission.requestHash,
    });
    return studioSuccess({ render: created, replayed: false }, crypto.randomUUID(), 201);
  } catch (error) {
    return asWorkbenchFailure(error);
  }
}
