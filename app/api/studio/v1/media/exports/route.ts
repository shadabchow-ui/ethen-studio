import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import {
  assertMediaExportPreset,
  MEDIA_EXPORT_PRESETS,
  MediaError,
} from "@ethen/studio-core/server/media";
import { resolveProjectScope } from "../../_lib/supabase-data";
import { claimMediaExport, listMediaExports } from "../../_lib/supabase-media";
import { isStudioFixtureLane, localStores } from "../../_lib/local-lane";
import { fixtureClaimExport, fixtureListExports } from "../../_lib/media-lane";

/** M5 exports console: list newest-first export rows for this project. */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const projectId = request.nextUrl.searchParams.get("projectId");
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    if (await isStudioFixtureLane()) {
      return studioSuccess({ exports: fixtureListExports(localStores().media, resolved) });
    }
    return studioSuccess({ exports: await listMediaExports(resolved) });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Media needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof MediaError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Export list failed.");
  }
}

export const dynamic = "force-dynamic";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * STUDIO_07 — V1 export adapter. Validates the preset and pinned inputs,
 * then claims an idempotent export row. The studio-worker packages bytes
 * after re-checking policy per input at build time — a right revoked
 * between claim and build fails the export rather than shipping it.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = asString(body.projectId);
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");

    const preset = asString(body.preset);
    const idempotencyKey = asString(body.idempotencyKey);
    if (!preset || !idempotencyKey) {
      return studioError("VALIDATION_ERROR", "preset and idempotencyKey are required.");
    }
    try {
      assertMediaExportPreset(preset);
    } catch {
      return studioError("VALIDATION_ERROR", `Export preset '${preset}' is not an advertised V1 export.`);
    }
    if (!Array.isArray(body.inputs) || body.inputs.length === 0) {
      return studioError("VALIDATION_ERROR", "Export needs at least one pinned input.");
    }
    for (const input of body.inputs as Array<Record<string, unknown>>) {
      if (!input || typeof input !== "object") return studioError("VALIDATION_ERROR", "Export inputs must be objects.");
      if (typeof input.assetId !== "string" || !input.assetId) {
        return studioError("VALIDATION_ERROR", "Every export input needs an assetId.");
      }
      if (!Number.isInteger(input.version) || (input.version as number) <= 0) {
        return studioError("VALIDATION_ERROR", "Every export input must pin an exact asset version.");
      }
      if (typeof input.contentHash !== "string" || !/^[0-9a-f]{64}$/i.test(input.contentHash)) {
        return studioError("VALIDATION_ERROR", "Every export input must pin an exact content hash.");
      }
      if (typeof input.kind !== "string" || !input.kind) {
        return studioError("VALIDATION_ERROR", "Every export input needs a kind.");
      }
    }
    if (await isStudioFixtureLane()) {
      const claimed = fixtureClaimExport(localStores().media, resolved, {
        idempotencyKey,
        preset,
        title: asString(body.title) ?? "",
        inputs: body.inputs as Array<{ assetId: string; version: number; contentHash: string; kind: string }>,
      });
      return studioSuccess(
        { exportId: claimed.exportId, lifecycle: claimed.lifecycle, replayed: claimed.replayed },
        undefined,
        claimed.replayed ? 200 : 202,
      );
    }
    const claimed = await claimMediaExport(resolved, {
      idempotencyKey,
      preset,
      presetVersion: MEDIA_EXPORT_PRESETS[preset as keyof typeof MEDIA_EXPORT_PRESETS].version,
      title: asString(body.title) ?? "",
      inputs: body.inputs as Array<Record<string, unknown>>,
    });
    return studioSuccess(
      { exportId: claimed.exportId, lifecycle: claimed.lifecycle, replayed: claimed.replayed },
      undefined,
      claimed.replayed ? 200 : 202,
    );
  } catch (error) {
    const setup = setupRequiredResponse(error, "Media needs the Studio data service.");
    if (setup) return setup;
    if (error instanceof MediaError) return studioError("INTERNAL_ERROR", error.message);
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Export claim failed.");
  }
}
