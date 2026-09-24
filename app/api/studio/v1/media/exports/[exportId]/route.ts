import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { resolveProjectScope } from "../../../_lib/supabase-data";
import { getMediaExport } from "../../../_lib/supabase-media";
import { isStudioFixtureLane, localStores } from "../../../_lib/local-lane";
import { fixtureGetExport } from "../../../_lib/media-lane";

export const dynamic = "force-dynamic";

/** STUDIO_07 — V1 export status adapter. Scoped read of one export row. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exportId: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { exportId } = await context.params;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId query param is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      const view = fixtureGetExport(localStores().media, resolved, exportId);
      if (!view) return studioError("NOT_FOUND", "Export not found in this project scope.");
      return studioSuccess({
        exportId: view.exportId,
        preset: view.preset,
        presetVersion: view.presetVersion,
        title: view.title,
        lifecycle: view.lifecycle,
        manifestHash: view.manifestHash,
        decisionId: view.decisionId,
      });
    }
    const view = await getMediaExport(resolved, exportId);
    if (!view) return studioError("NOT_FOUND", "Export not found in this project scope.");
    return studioSuccess({
      exportId: view.exportId,
      preset: view.preset,
      presetVersion: view.presetVersion,
      title: view.title,
      lifecycle: view.lifecycle,
      manifestHash: view.manifestHash,
      decisionId: view.decisionId,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Media needs the Studio data service.");
    if (setup) return setup;
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Export status failed.");
  }
}
