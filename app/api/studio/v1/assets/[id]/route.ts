import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { getAssetDetail, isSetupError, resolveProjectScope, tombstoneAsset } from "../../_lib/supabase-data";

export const dynamic = "force-dynamic";

/**
 * STUDIO_02 — V1 asset detail adapter. GET returns the asset with versions,
 * lineage and tombstone/receipt state; DELETE tombstones (receipt retained).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { id } = await context.params;
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const detail = await getAssetDetail(resolved, id);
    if (!detail) return studioError("NOT_FOUND", "Asset not found in this project.");
    return studioSuccess({ state: detail.tombstonedAt ? "tombstoned" : "ready", asset: detail });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Assets need the Studio data service.");
    if (setup) return setup;
    if (isSetupError(error)) {
      return studioError("SETUP_REQUIRED", "Assets need the Studio data service.", undefined, { dependency: "supabase" });
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Asset read failed.");
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const { id } = await context.params;
    const body = await readStudioJson(request).catch(() => ({}) as Record<string, unknown>);
    const projectId =
      (typeof body.projectId === "string" ? body.projectId.trim() : "") ||
      new URL(request.url).searchParams.get("projectId")?.trim() ||
      "";
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const reason = typeof body.reason === "string" && body.reason.trim().length > 0 ? body.reason.trim() : "deleted";
    const receipt = await tombstoneAsset(resolved, id, reason);
    if (!receipt) return studioError("NOT_FOUND", "Asset not found in this project.");
    return studioSuccess({ state: "tombstoned", receipt });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Assets need the Studio data service.");
    if (setup) return setup;
    if (isSetupError(error)) {
      return studioError("SETUP_REQUIRED", "Assets need the Studio data service.", undefined, { dependency: "supabase" });
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Asset tombstone failed.");
  }
}
