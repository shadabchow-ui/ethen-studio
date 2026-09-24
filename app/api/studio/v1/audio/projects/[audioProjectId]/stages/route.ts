import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { resolveProjectScope } from "../../../../_lib/supabase-data";
import { AudioRouteError, getAudioProjectDetail, upsertAudioStageRow } from "../../../../_lib/supabase-audio";
import { isStudioFixtureLane, localStores } from "../../../../_lib/local-lane";
import { fixtureGetAudioProjectDetail, fixtureUpsertAudioStage } from "../../../../_lib/audio-lane";

export const dynamic = "force-dynamic";

function asNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStr(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_11 — V1 audio stage sync adapter. Records stage→canonical-job
 * lineage after the client admits each stage through the shared /jobs
 * runtime. This route never admits, dispatches, or settles work: it is
 * the lineage map, not a second ledger.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ audioProjectId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { audioProjectId } = await params;
    const body = await readStudioJson(request);
    const projectId = asStr(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!audioProjectId) return studioError("VALIDATION_ERROR", "audioProjectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const stage = asStr(body.stage);
    const status = asStr(body.status);
    if (!stage) return studioError("VALIDATION_ERROR", "stage is required.");
    if (!status) return studioError("VALIDATION_ERROR", "status is required.");
    if (await isStudioFixtureLane()) {
      const lane = localStores().audio;
      fixtureUpsertAudioStage(lane, resolved, audioProjectId, {
        stage,
        attempt: asNum(body.attempt) ?? 1,
        jobId: asStr(body.jobId),
        status,
        quoteId: asStr(body.quoteId),
        estimatedIcu: asNum(body.estimatedIcu),
        settledIcu: asNum(body.settledIcu),
        transcriptRevision: asNum(body.transcriptRevision),
        errorCode: asStr(body.errorCode),
        errorMessage: asStr(body.errorMessage),
      });
      const detail = fixtureGetAudioProjectDetail(lane, resolved, audioProjectId);
      return studioSuccess({ audioProjectId, stages: detail?.stages ?? [] });
    }
    await upsertAudioStageRow(resolved, audioProjectId, {
      stage,
      attempt: asNum(body.attempt) ?? 1,
      jobId: asStr(body.jobId),
      status,
      quoteId: asStr(body.quoteId),
      estimatedIcu: asNum(body.estimatedIcu),
      settledIcu: asNum(body.settledIcu),
      transcriptRevision: asNum(body.transcriptRevision),
      errorCode: asStr(body.errorCode),
      errorMessage: asStr(body.errorMessage),
    });
    const detail = await getAudioProjectDetail(resolved, audioProjectId);
    return studioSuccess({ audioProjectId, stages: detail?.stages ?? [] });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Audio projects need the Studio data service.");
    if (setup) return setup;
    if (error instanceof AudioRouteError) return studioError(error.status, error.message);
    return studioError("INTERNAL_ERROR", "Audio stage sync failed.");
  }
}
