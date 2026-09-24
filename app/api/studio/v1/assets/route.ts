import { requireProject, requireUserSession } from "@ethen/ai/platform/auth/guards";
import { NextRequest } from "next/server";
import { parseStudioPagination, readStudioJson, studioError, studioSuccess } from "@/lib/media/api-v1";
import { setupRequiredResponse } from "@/lib/media/studio-setup";
import { decodeCursor, encodeCursor } from "@ethen/studio-core/server/data";
import {
  DataError,
  createAssetWithVersion,
  isSetupError,
  listAssets,
  resolveProjectScope,
} from "../_lib/supabase-data";
import { isStudioFixtureLane, localStores } from "../_lib/local-lane";
import { stageFixtureJobAssets } from "../_lib/fixture-assets";
import { getFixtureLane } from "@ethen/studio-core/server/runtime/fixture-lane";

export const dynamic = "force-dynamic";

const ASSET_KINDS = new Set(["image", "video", "audio", "transcript", "document", "package"]);

/**
 * STUDIO_02 — V1 assets adapter. GET lists/searches scoped assets;
 * POST creates an asset with its first immutable version.
 */
export async function GET(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim() ?? "";
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const page = parseStudioPagination(url);
    const offset = decodeCursor(page.cursor);
    const query = url.searchParams.get("q") ?? "";
    if (await isStudioFixtureLane()) {
      // P07 RD-01: materialize completed fixture job outputs into the
      // canonical local asset lane before listing (idempotent replay).
      await stageFixtureJobAssets(getFixtureLane(), resolved, localStores().keys);
    }
    const { items, total } = await listAssets({ scope: resolved, query, limit: page.limit, offset });
    const next = offset + items.length;
    return studioSuccess({
      state: items.length === 0 && total === 0 ? "empty" : "ready",
      query,
      items,
      nextCursor: next < total ? encodeCursor(next) : null,
      total,
    });
  } catch (error) {
    const setup = setupRequiredResponse(error, "Assets need the Studio data service.");
    if (setup) return setup;
    if (isSetupError(error)) {
      return studioError("SETUP_REQUIRED", "Assets need the Studio data service.", undefined, { dependency: "supabase" });
    }
    if (error instanceof DataError) {
      return studioError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Asset list failed.");
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const session = await requireUserSession();
    if (session.response) return session.response;
    const body = await readStudioJson(request);
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) return studioError("VALIDATION_ERROR", "projectId is required.");
    const authorization = await requireProject({ api: true, projectId });
    if (authorization.response) return authorization.response;
    const resolved = await resolveProjectScope(projectId);
    if (!resolved) return studioError("SETUP_REQUIRED", "Project has no Studio data scope yet.");
    const filename = typeof body.filename === "string" ? body.filename.trim() : "";
    const kind = typeof body.kind === "string" ? body.kind.trim() : "";
    const storageKey = typeof body.storageKey === "string" ? body.storageKey.trim() : "";
    const sha256 = typeof body.sha256 === "string" ? body.sha256.trim().toLowerCase() : "";
    const byteSize = typeof body.byteSize === "number" ? body.byteSize : NaN;
    const origin = typeof body.origin === "string" ? body.origin.trim() : "";
    if (!filename || filename.length > 255 || filename.includes("/") || filename.includes("\\")) {
      return studioError("VALIDATION_ERROR", "filename is required (<=255 chars, no path separators).");
    }
    if (!ASSET_KINDS.has(kind)) return studioError("VALIDATION_ERROR", "kind is unknown.");
    if (!storageKey || /^https?:\/\//i.test(storageKey)) {
      return studioError("VALIDATION_ERROR", "storageKey must be an owned storage key, never a provider URL.");
    }
    if (!/^[0-9a-f]{64}$/.test(sha256)) return studioError("VALIDATION_ERROR", "sha256 must be 64 hex characters.");
    if (!Number.isInteger(byteSize) || byteSize < 0) {
      return studioError("VALIDATION_ERROR", "byteSize must be a non-negative integer.");
    }
    if (!origin) return studioError("VALIDATION_ERROR", "origin is required.");
    const mediaMetadata =
      body.mediaMetadata && typeof body.mediaMetadata === "object" && !Array.isArray(body.mediaMetadata)
        ? (body.mediaMetadata as Record<string, unknown>)
        : {};
    const detail = await createAssetWithVersion(resolved, {
      filename,
      kind,
      storageKey,
      sha256,
      byteSize,
      origin,
      mediaMetadata,
    });
    return studioSuccess({ state: "ready", asset: detail }, undefined, 201);
  } catch (error) {
    const setup = setupRequiredResponse(error, "Assets need the Studio data service.");
    if (setup) return setup;
    if (isSetupError(error)) {
      return studioError("SETUP_REQUIRED", "Assets need the Studio data service.", undefined, { dependency: "supabase" });
    }
    if (error instanceof DataError) {
      return studioError(error.code === "NOT_FOUND" ? "NOT_FOUND" : "VALIDATION_ERROR", error.message);
    }
    return studioError("INTERNAL_ERROR", error instanceof Error ? error.message : "Asset creation failed.");
  }
}
