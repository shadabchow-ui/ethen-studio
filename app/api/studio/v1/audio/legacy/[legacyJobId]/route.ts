import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { projectLegacyVoiceJob } from "@ethen/studio-core/server/audio";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { AudioRouteError, readLegacyVoiceJobRow } from "../../../_lib/supabase-audio";
import { isStudioFixtureLane } from "../../../_lib/local-lane";

export const dynamic = "force-dynamic";

/**
 * STUDIO_11 — V1 legacy Voice read adapter. Projects a legacy Voice job
 * read-only with its original id preserved. Existing runs are never
 * switched; new Studio work admits through the shared runtime.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ legacyJobId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { legacyJobId } = await params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    if (!legacyJobId) return studioError("VALIDATION_ERROR", "legacyJobId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      // Fixtures stage no legacy Voice jobs: the lane answers NOT_FOUND,
      // the same shape a production miss returns.
      return studioError("NOT_FOUND", `Legacy Voice job ${legacyJobId} was not found.`);
    }
    const row = await readLegacyVoiceJobRow(legacyJobId);
    if (!row) return studioError("NOT_FOUND", `Legacy Voice job ${legacyJobId} was not found.`);
    const view = projectLegacyVoiceJob(row);
    return studioSuccess({ ...view, canonicalAudioProjectId: row.canonical_audio_project_id ?? null });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Audio projects need the Studio data service.");
    if (setup) return setup;
    if (error instanceof AudioRouteError) return studioError(error.status, error.message);
    return studioError("INTERNAL_ERROR", "Legacy Voice read failed.");
  }
}
