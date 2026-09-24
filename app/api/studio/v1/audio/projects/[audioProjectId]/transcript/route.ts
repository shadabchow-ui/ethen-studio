import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { validateTranscript } from "@ethen/studio-core/server/media";
import type { AudioStageId } from "@ethen/studio-core/server/audio";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import {
  AudioRouteError,
  appendTranscriptRevisionRow,
  getAudioProjectDetail,
} from "../../../../_lib/supabase-audio";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureAppendTranscriptRevision, fixtureGetAudioProjectDetail } from "../../../../_lib/audio-lane";

export const dynamic = "force-dynamic";

const KIND_STAGE_ORDER: Readonly<Record<string, readonly AudioStageId[]>> = {
  tts: ["synthesize"],
  transcribe: ["transcribe"],
  changer: ["transcribe", "mix"],
  dub: ["transcribe", "translate", "synthesize", "align", "mix"],
};

/**
 * STUDIO_11 — V1 transcript edit adapter. PUT validates a canonical
 * transcript, appends a revision, and invalidates every compute stage
 * downstream of transcription. Edits never mutate settled cost; retry
 * rebuilds from the new revision.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ audioProjectId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { audioProjectId } = await params;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" && body.projectId.trim() ? body.projectId : null;
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!audioProjectId) return studioError("VALIDATION_ERROR", "audioProjectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const lane = (await isStudioFixtureLane()) ? localStores().audio : null;
    const detail = lane
      ? fixtureGetAudioProjectDetail(lane, resolved, audioProjectId)
      : await getAudioProjectDetail(resolved, audioProjectId);
    if (!detail) return studioError("NOT_FOUND", `Audio project ${audioProjectId} was not found.`);

    let transcript: unknown;
    try {
      transcript = validateTranscript(body.transcript);
    } catch (thrown) {
      const message = thrown instanceof Error ? thrown.message : "Transcript is invalid.";
      return studioError("VALIDATION_ERROR", message);
    }
    const order = KIND_STAGE_ORDER[detail.kind] ?? [];
    const anchor = order.indexOf("transcribe");
    const downstream = anchor < 0 ? order : order.slice(anchor + 1);
    const actorId = authorization.actorId ?? "unknown";
    const revision = lane
      ? fixtureAppendTranscriptRevision(lane, resolved, audioProjectId, transcript, String(actorId), downstream)
      : await appendTranscriptRevisionRow(resolved, audioProjectId, transcript, String(actorId), downstream);
    return studioSuccess({ audioProjectId, revision, invalidated: downstream });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Audio projects need the Studio data service.");
    if (setup) return setup;
    if (error instanceof AudioRouteError) return studioError(error.status, error.message);
    return studioError("INTERNAL_ERROR", "Transcript edit failed.");
  }
}
