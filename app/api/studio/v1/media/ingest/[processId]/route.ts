import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { getMediaProcess } from "../../../_lib/supabase-media";

export const dynamic = "force-dynamic";

/** STUDIO_07 — V1 ingest status adapter. Scoped read of one process row. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ processId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { processId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId query param is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const view = await getMediaProcess(resolved, processId);
    if (!view) return studioError("NOT_FOUND", "Ingest process not found in this project scope.");
    return studioSuccess({
      processId: view.processId,
      stage: view.stage,
      assetId: view.assetId,
      version: view.version,
      sha256: view.sha256,
      failureReason: view.failureReason,
      detail: view.detail,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Media needs the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Ingest status failed.");
  }
}
